import { Component, OnInit, Input, ChangeDetectionStrategy, ChangeDetectorRef, NgZone, OnDestroy } from "@angular/core";
import { trigger, state, style, transition, animate } from "@angular/animations";
import { Observable } from "rxjs/Observable";
import { map } from "rxjs/operators";

import { AchtergrondLaag } from "./kaart-elementen";
import { KaartComponentBase } from "./kaart-component-base";
import { VacuousDispatcher, KaartCmdDispatcher } from "./kaart-event-dispatcher";
import {
  KaartInternalMsg,
  KaartInternalSubMsg,
  achtergrondlagenGezetWrapper,
  forgetWrapper,
  achtergrondtitelGezetWrapper,
  AchtergrondlagenGezetMsg,
  AchtergrondtitelGezetMsg
} from "./kaart-internal-messages";
import { ofType } from "../util/operators";
import { observeOnAngular } from "../util/observe-on-angular";
import * as prt from "./kaart-protocol";

enum DisplayMode {
  SHOWING_STATUS,
  SELECTING
}

const Visible = "visible";
const Invisible = "invisible";

@Component({
  selector: "awv-kaart-achtergrond-selector",
  templateUrl: "./kaart-achtergrond-selector.component.html",
  styleUrls: ["./kaart-achtergrond-selector.component.scss"],
  animations: [
    trigger("visibility", [
      state(
        Visible,
        style({
          opacity: "1.0",
          maxWidth: "100px",
          marginRight: "12px"
        })
      ),
      state(
        Invisible,
        style({
          opacity: "0.0",
          maxWidth: "0px",
          marginRight: "0px"
        })
      ),
      transition(Invisible + " => " + Visible, animate("200ms ease-in")),
      transition(Visible + " => " + Invisible, animate("150ms ease-in"))
    ]),
    trigger("popOverState", [
      state(
        "show",
        style({
          opacity: 1
        })
      ),
      state(
        "hide",
        style({
          opacity: 0
        })
      ),
      transition("show => hide", animate("600ms ease-out")),
      transition("hide => show", animate("1000ms ease-in"))
    ])
  ],
  changeDetection: ChangeDetectionStrategy.OnPush // Bij default is er een endless loop van updates
})
export class KaartAchtergrondSelectorComponent extends KaartComponentBase implements OnInit, OnDestroy {
  // component state is aanvaardbaar zolang de html view er niet direct aan komt
  private displayMode: DisplayMode = DisplayMode.SHOWING_STATUS;
  achtergrondTitel = "";

  backgroundTiles$: Observable<Array<AchtergrondLaag>> = Observable.empty();

  @Input() dispatcher: KaartCmdDispatcher<KaartInternalMsg> = VacuousDispatcher;
  @Input() internalMessage$: Observable<KaartInternalSubMsg> = Observable.never();

  constructor(private readonly cdr: ChangeDetectorRef, zone: NgZone) {
    super(zone);
  }

  ngOnInit() {
    // hackadihack -> er is een raceconditie in de change detection van Angular. Zonder wordt soms de selectiecomponent niet getoond.
    // setTimeout(() => this.cdr.detectChanges(), 2000);

    this.dispatcher.dispatch({
      type: "Subscription",
      subscription: prt.AchtergrondlagenSubscription(achtergrondlagenGezetWrapper),
      wrapper: forgetWrapper // TODO we moeten hier de subscription opvangen
    });

    this.dispatcher.dispatch({
      type: "Subscription",
      subscription: prt.AchtergrondTitelSubscription(achtergrondtitelGezetWrapper),
      wrapper: forgetWrapper // TODO we moeten hier de subscription opvangen
    });

    this.backgroundTiles$ = this.internalMessage$.pipe(
      ofType<KaartInternalSubMsg, AchtergrondlagenGezetMsg>("AchtergrondlagenGezet"),
      map(a => a.achtergrondlagen.toArray()),
      observeOnAngular(this.zone)
    );

    this.internalMessage$
      .pipe(
        ofType<KaartInternalSubMsg, AchtergrondtitelGezetMsg>("AchtergrondtitelGezet"), //
        map(a => a.titel),
        observeOnAngular(this.zone)
      )
      .subscribe(titel => {
        this.achtergrondTitel = titel;
        this.cdr.detectChanges(); // We zitten nochthans in observeOnAngular.
      });
  }

  ngOnDestroy() {
    super.ngOnDestroy();
  }

  kies(laag: AchtergrondLaag): void {
    if (this.displayMode === DisplayMode.SELECTING) {
      // We wachten een beetje met de lijst te laten samen klappen zodat de tile met de nieuwe achtergrondlaag
      // van stijl kan aangepast worden (gebeurt automagisch door Angular change detection) vooraleer het inklapeffect
      // in werking treedt. Dat ziet er iets beter uit omdat in het andere geval de tile abrupt verspringt na het
      // inklappen.
      this.displayMode = DisplayMode.SHOWING_STATUS;
      if (laag.titel !== this.achtergrondTitel) {
        this.dispatcher.dispatch({ type: "KiesAchtergrond", titel: laag.titel, wrapper: forgetWrapper });
        this.achtergrondTitel = laag.titel;
      }
    } else {
      this.displayMode = DisplayMode.SELECTING;
    }
    this.cdr.detectChanges();
  }

  isCurrentlyBackground(laag: AchtergrondLaag): boolean {
    return laag.titel === this.achtergrondTitel;
  }

  tileVisibility(laag: AchtergrondLaag): string {
    switch (this.displayMode) {
      case DisplayMode.SHOWING_STATUS: {
        return this.isCurrentlyBackground(laag) ? Visible : Invisible;
      }
      case DisplayMode.SELECTING: {
        return Visible;
      }
    }
  }
}
