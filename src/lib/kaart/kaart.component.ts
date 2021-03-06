import { Component, ElementRef, Inject, Input, NgZone, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from "@angular/core";
import { Set } from "immutable";
import * as ol from "openlayers";
import { ReplaySubject } from "rxjs";
import "rxjs/add/observable/combineLatest";
import "rxjs/add/observable/empty";
import "rxjs/add/observable/never";
import "rxjs/add/observable/of";
import { Observable } from "rxjs/Observable";
import { concatAll, filter, last, map, merge, scan, shareReplay, startWith, switchMap, takeUntil, tap } from "rxjs/operators";

import { asap } from "../util/asap";
import { observerOutsideAngular } from "../util/observer-outside-angular";
import { emitSome } from "../util/operators";
import { forEach } from "../util/option";

import { KaartComponentBase } from "./kaart-component-base";
import { KAART_CFG, KaartConfig } from "./kaart-config";
import { ReplaySubjectKaartCmdDispatcher } from "./kaart-event-dispatcher";
import { KaartInternalMsg, KaartInternalSubMsg } from "./kaart-internal-messages";
import * as prt from "./kaart-protocol";
import * as red from "./kaart-reducer";
import { KaartWithInfo } from "./kaart-with-info";
import { kaartLogger } from "./log";
import { ModelChanger, ModelChanges, modelChanges, UiElementSelectie } from "./model-changes";

// Om enkel met @Input properties te moeten werken. Op deze manier kan een stream van KaartMsg naar de caller gestuurd worden
export type KaartMsgObservableConsumer = (msg$: Observable<prt.KaartMsg>) => void;
export const vacuousKaartMsgObservableConsumer: KaartMsgObservableConsumer = (msg$: Observable<prt.KaartMsg>) => ({});

@Component({
  selector: "awv-kaart",
  templateUrl: "./kaart.component.html",
  styleUrls: ["./kaart.component.scss"],
  encapsulation: ViewEncapsulation.Emulated // Omwille hiervan kunnen we geen globale CSS gebruiken, maar met Native werken animaties niet
})
export class KaartComponent extends KaartComponentBase implements OnInit, OnDestroy {
  private readonly modelChanger: ModelChanger = ModelChanger();
  readonly modelChanges: ModelChanges = modelChanges(this.modelChanger);
  readonly kaartModel$: Observable<KaartWithInfo> = Observable.empty();
  readonly aanwezigeElementen$: Observable<Set<string>>;

  @ViewChild("map") mapElement: ElementRef;

  /**
   * Dit houdt heel de constructie bij elkaar. Ofwel awv-kaart-classic (in geval van declaratief gebruik) ofwel
   * een component van de gebruikende applicatie (in geval van programmatorisch gebruik) zet hier een Observable
   * waarmee events naar de component gestuurd kunnen worden.
   */
  @Input() kaartCmd$: Observable<prt.Command<prt.KaartMsg>> = Observable.empty();
  @Input() messageObsConsumer: KaartMsgObservableConsumer = vacuousKaartMsgObservableConsumer;

  /**
   * Dit is een beetje ongelukkig, maar ook componenten die door de KaartComponent zelf aangemaakt worden moeten events kunnen sturen
   * naar de KaartComponent. Een alternatief zou kunnen zijn één dispatcher hier te maken en de KaartClassicComponent die te laten
   * ophalen in afterViewInit.
   */
  readonly internalCmdDispatcher: ReplaySubjectKaartCmdDispatcher<KaartInternalMsg> = new ReplaySubjectKaartCmdDispatcher();

  private readonly msgSubj = new ReplaySubject<prt.KaartMsg>(1000, 500);

  @Input() minZoom = 2; // TODO naar config
  @Input() maxZoom = 15; // TODO naar config
  @Input() naam = "kaart";
  @Input() selectieModus: prt.SelectieModus = "none";

  // Dit dient om messages naar toe te sturen

  internalMessage$: Observable<KaartInternalSubMsg> = Observable.empty();

  private readonly kaartModelObsSubj = new ReplaySubject<Observable<KaartWithInfo>>(1);

  constructor(@Inject(KAART_CFG) readonly config: KaartConfig, zone: NgZone) {
    super(zone);
    this.internalMessage$ = this.msgSubj.pipe(
      filter(m => m.type === "KaartInternal"), //
      map(m => (m as KaartInternalMsg).payload),
      emitSome,
      tap(m => kaartLogger.debug("een interne message werd ontvangen:", m)),
      shareReplay(1) // Waarom hebben we eigenlijk het vorige commando nog nodig?
    );

    this.kaartModel$ = this.initialising$.pipe(
      observerOutsideAngular(zone),
      tap(() => this.messageObsConsumer(this.msgSubj)), // Wie de messageObsConsumer @Input gezet heeft, krijgt een observable van messages
      switchMap(() => this.createMapModelForCommands()),
      takeUntil(this.destroying$),
      shareReplay(1)
    );

    this.kaartModel$.subscribe(
      model => {
        kaartLogger.debug("reduced to", model);
        // TODO dubbels opvangen. Als we een versienummer ophogen telkens we effectief het model aanpassen, dan kunnen we
        // de modelConsumer werk besparen in die gevallen dat de reducer geen nieuwe toestand heeft gegenereerd.
      },
      e => kaartLogger.error("error", e),
      () => kaartLogger.info("kaart & cmd terminated")
    );

    // Het laatste model is dat net voor de stream van model unsubscribed is, dus bij ngOnDestroy
    this.kaartModel$.pipe(last()).subscribe(model => {
      kaartLogger.info(`kaart ${this.naam} opkuisen`);
      model.map.setTarget((undefined as any) as string); // Hack omdat openlayers typedefs kaduuk zijn
    });

    this.aanwezigeElementen$ = this.modelChanges.uiElementSelectie$.pipe(
      scan((st: Set<string>, selectie: UiElementSelectie) => (selectie.aan ? st.add(selectie.naam) : st.delete(selectie.naam)), Set()),
      startWith(Set())
    );
  }

  private createMapModelForCommands(): Observable<KaartWithInfo> {
    const initieelModel = this.initieelModel();
    kaartLogger.info(`Kaart ${this.naam} aangemaakt`);

    const messageConsumer = (msg: prt.KaartMsg) => {
      asap(() => this.msgSubj.next(msg));
    };

    return this.kaartCmd$.pipe(
      merge(this.internalCmdDispatcher.commands$),
      tap(c => kaartLogger.debug("kaart command", c)),
      takeUntil(this.destroying$),
      observerOutsideAngular(this.zone),
      scan((model: KaartWithInfo, cmd: prt.Command<any>) => {
        const { model: newModel, message } = red.kaartCmdReducer(cmd)(model, this.modelChanger, messageConsumer);
        kaartLogger.debug("produceert", message);
        forEach(message, messageConsumer); // stuur het resultaat terug naar de eigenaar van de kaartcomponent
        return newModel; // en laat het nieuwe model terugvloeien
      }, initieelModel)
    );
  }

  private initieelModel(): KaartWithInfo {
    const dienstkaartProjectie: ol.proj.Projection = ol.proj.get("EPSG:31370");
    // Zonder deze extent zoomen we op de hele wereld en Vlaanderen is daar maar een heeel klein deeltje van
    dienstkaartProjectie.setExtent([18000.0, 152999.75, 280144.0, 415143.75]); // zet de extent op die van de dienstkaart

    const kaart = new ol.Map({
      controls: [],
      interactions: [],
      layers: [],
      pixelRatio: 1, // dit moet op 1 staan anders zal OL 512x512 tiles ophalen op retina displays en die zitten niet in onze geowebcache
      target: this.mapElement.nativeElement,
      logo: false,
      view: new ol.View({
        projection: dienstkaartProjectie,
        center: this.config.defaults.middelpunt,
        minZoom: this.minZoom,
        maxZoom: this.maxZoom,
        zoom: this.config.defaults.zoom
      })
    });

    return new KaartWithInfo(this.config, this.naam, this.mapElement.nativeElement.parentElement, kaart, this.modelChanger);
  }

  get message$(): Observable<prt.KaartMsg> {
    return this.msgSubj;
  }

  get kaartWithInfo$(): Observable<KaartWithInfo> {
    // TODO geen casting meer in RxJs 6
    return (this.kaartModelObsSubj.pipe(concatAll()) as any) as Observable<KaartWithInfo>;
  }
}
