import { AfterViewInit, Component, NgZone, OnInit, QueryList, ViewChildren } from "@angular/core";
import { MatButton } from "@angular/material";
import { Function1, Function3, Function4 } from "fp-ts/lib/function";
import { none, Option, some } from "fp-ts/lib/Option";
import { List, OrderedMap } from "immutable";
import * as ol from "openlayers";
import * as rx from "rxjs";
import { debounceTime, distinctUntilChanged, filter, map, switchMap, take } from "rxjs/operators";

import { flatten } from "../../util/operators";
import * as ke from "../kaart-elementen";
import { actieveModusGezetWrapper, KaartInternalMsg, kaartLogOnlyWrapper } from "../kaart-internal-messages";
import { KaartModusComponent } from "../kaart-modus-component";
import * as prt from "../kaart-protocol";
import { Viewinstellingen } from "../kaart-protocol";
import { KaartComponent } from "../kaart.component";
import { kaartLogger } from "../log";

export const MijnLocatieUiSelector = "Mijnlocatie";
const MijnLocatieLaagNaam = "Mijn Locatie";

const TrackingInterval = 500; // aantal milliseconden tussen tracking updates

interface Resultaat {
  zoom: number;
  doel: number;
  positie: Position;
}

const Resultaat: Function3<number, number, Position, Resultaat> = (zoom, doel, positie) => ({ zoom: zoom, doel: doel, positie: positie });

const pasLocatieFeatureAan: Function4<ol.Feature, ol.Coordinate, number, number, ol.Feature> = (feature, coordinate, zoom, accuracy) => {
  feature.setGeometry(new ol.geom.Point(coordinate));
  zetStijl(feature, zoom, accuracy);
  feature.changed(); // force redraw meteen
  return feature;
};

const zetStijl: Function3<ol.Feature, number, number, void> = (feature, zoom, accuracy) => feature.setStyle(locatieStijlFunctie(accuracy));

const locatieStijlFunctie: Function1<number, ol.FeatureStyleFunction> = accuracy => {
  return resolution => {
    const accuracyInPixels = accuracy / resolution;
    const radius = Math.max(accuracyInPixels, 12); // nauwkeurigheid cirkel toch nog tonen zelfs indien ver uitgezoomd
    return [
      new ol.style.Style({
        zIndex: 2,
        image: new ol.style.Circle({
          fill: new ol.style.Fill({
            color: "rgba(66, 133, 244, 1.0)"
          }),
          stroke: new ol.style.Stroke({
            color: "rgba(255, 255, 255, 1.0)",
            width: 2
          }),
          radius: 6
        })
      }),
      new ol.style.Style({
        zIndex: 1,
        image: new ol.style.Circle({
          fill: new ol.style.Fill({
            color: "rgba(65, 105, 225, 0.15)"
          }),
          stroke: new ol.style.Stroke({
            color: "rgba(65, 105, 225, 0.5)",
            width: 1
          }),
          radius: radius
        })
      })
    ];
  };
};

@Component({
  selector: "awv-kaart-mijn-locatie",
  templateUrl: "./kaart-mijn-locatie.component.html",
  styleUrls: ["./kaart-mijn-locatie.component.scss"]
})
export class KaartMijnLocatieComponent extends KaartModusComponent implements OnInit, AfterViewInit {
  private viewinstellingen$: rx.Observable<Viewinstellingen> = rx.empty();
  private zoomdoelSetting$: rx.Observable<Option<number>> = rx.empty();
  private activeerSubj: rx.Subject<boolean> = new rx.Subject<boolean>();
  private locatieSubj: rx.Subject<Position> = new rx.Subject<Position>();

  enabled$: rx.Observable<boolean> = rx.of(true);

  @ViewChildren("locateBtn")
  locateBtnQry: QueryList<MatButton>;

  private mijnLocatie: Option<ol.Feature> = none;
  private watchId: Option<number> = none;

  modus(): string {
    return MijnLocatieUiSelector;
  }

  isDefaultModus() {
    return false;
  }

  public get isActief(): boolean {
    return this.actief;
  }

  protected kaartSubscriptions(): prt.Subscription<KaartInternalMsg>[] {
    return [prt.ActieveModusSubscription(actieveModusGezetWrapper)];
  }

  // geactiveerd van buiten af (bij enabled andere modus)
  activeer(active: boolean) {
    this.actief = active;
    this.activeerSubj.next(this.actief);
    if (!active) {
      this.verwijderFeature();
    }
  }

  // activatie geinitieerd door gebruiker
  toggleLocatieTracking(): void {
    this.activeer(!this.actief);
    if (this.actief) {
      this.publiceerActivatie();
    } else {
      this.publiceerDeactivatie();
    }
  }

  // deactiveer bij pannen. Locatie laten staan
  deactiveerTracking(): void {
    this.actief = false;
    this.activeerSubj.next(this.actief);
    this.publiceerDeactivatie();
  }

  constructor(zone: NgZone, private readonly parent: KaartComponent) {
    super(parent, zone);
  }

  ngOnInit(): void {
    super.ngOnInit();

    this.dispatch({
      type: "VoegLaagToe",
      positie: 0,
      laag: this.createLayer(),
      magGetoondWorden: true,
      laaggroep: "Tools",
      legende: none,
      stijlInLagenKiezer: none,
      wrapper: kaartLogOnlyWrapper
    });

    this.viewinstellingen$ = this.parent.modelChanges.viewinstellingen$;
    this.zoomdoelSetting$ = this.parent.modelChanges.mijnLocatieZoomDoel$;
    this.enabled$ = this.zoomdoelSetting$.pipe(map(m => m.isSome()));
  }

  ngAfterViewInit() {
    super.ngAfterViewInit();

    const zoomdoel$: rx.Observable<number> = this.zoomdoelSetting$.pipe(flatten); // Hou enkel de effectieve zoomniveaudoelen over
    const zoom$ = this.viewinstellingen$.pipe(
      distinctUntilChanged((vi1, vi2) => vi1.zoom === vi2.zoom && vi1.minZoom === vi2.minZoom && vi1.maxZoom === vi2.maxZoom),
      map(vi => vi.zoom)
    );

    // start of stop tracking
    this.bindToLifeCycle(this.activeerSubj).subscribe(actief => (actief ? this.startTracking() : this.stopTracking()));

    // pas positie aan bij nieuwe locatie
    this.bindToLifeCycle(
      rx.combineLatest(zoom$, zoomdoel$, this.locatieSubj.pipe(debounceTime(TrackingInterval))).pipe(
        filter(() => this.actief),
        map(([zoom, doel, locatie]) => Resultaat(zoom, doel, locatie))
      )
    ).subscribe(resultaat => this.zetMijnPositie(resultaat.positie, resultaat.zoom, resultaat.doel));

    // deactiveer tracking bij pannen kaart
    this.bindToLifeCycle(this.parent.modelChanges.dragInfo$.pipe(filter(() => this.actief))).subscribe(() => {
      this.deactiveerTracking();
    });
  }

  private maakNieuwFeature(coordinate: ol.Coordinate, zoom: number, accuracy: number): Option<ol.Feature> {
    const feature = new ol.Feature(new ol.geom.Point(coordinate));
    feature.setStyle(locatieStijlFunctie(accuracy));
    this.dispatch(prt.VervangFeaturesCmd(MijnLocatieLaagNaam, List.of(feature), kaartLogOnlyWrapper));
    return some(feature);
  }

  private verwijderFeature() {
    this.dispatch(prt.VervangFeaturesCmd(MijnLocatieLaagNaam, List(), kaartLogOnlyWrapper));
  }

  private meldFout(fout: PositionError | string) {
    kaartLogger.error("error", fout);
    this.dispatch(
      prt.MeldComponentFoutCmd(
        List.of("Zoomen naar huidige locatie niet mogelijk", "De toepassing heeft geen toestemming om locatie te gebruiken")
      )
    );
  }

  private stopTracking() {
    this.watchId.map(watchId => navigator.geolocation.clearWatch(watchId));
    this.mijnLocatie = none;
  }

  private startTracking() {
    if (navigator.geolocation) {
      this.watchId = some(
        navigator.geolocation.watchPosition(
          //
          positie => this.locatieSubj.next(positie),
          fout => this.meldFout(fout),
          {
            enableHighAccuracy: true,
            timeout: 1000
          }
        )
      );
    } else {
      this.meldFout("Geen geolocatie mogelijk");
    }
  }

  private zetMijnPositie(position: Position, zoom: number, doelzoom: number) {
    const longLat: ol.Coordinate = [position.coords.longitude, position.coords.latitude];
    const coordinate = ol.proj.fromLonLat(longLat, "EPSG:31370");

    this.mijnLocatie = this.mijnLocatie
      .map(feature => pasLocatieFeatureAan(feature, coordinate, zoom, position.coords.accuracy))
      .orElse(() => {
        if (zoom <= 8) {
          // We zitten nu op een te laag zoomniveau, dus gaan we eerst inzoomen.
          this.dispatch(prt.VeranderZoomCmd(doelzoom, kaartLogOnlyWrapper));
        }
        return this.maakNieuwFeature(coordinate, zoom, position.coords.accuracy);
      });

    this.dispatch(prt.VeranderMiddelpuntCmd(coordinate, some(TrackingInterval)));
  }

  createLayer(): ke.VectorLaag {
    return {
      type: ke.VectorType,
      titel: MijnLocatieLaagNaam,
      source: new ol.source.Vector(),
      styleSelector: none,
      styleSelectorBron: none,
      selectieStyleSelector: none,
      hoverStyleSelector: none,
      selecteerbaar: false,
      hover: false,
      minZoom: 2,
      maxZoom: 15,
      velden: OrderedMap<string, ke.VeldInfo>(),
      offsetveld: none,
      verwijderd: false
    };
  }
}