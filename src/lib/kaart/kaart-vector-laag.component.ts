import { Component, Input, NgZone, OnDestroy, OnInit, ViewEncapsulation } from "@angular/core";
import { KaartComponent } from "./kaart.component";

import * as ol from "openlayers";

@Component({
  selector: "awv-kaart-vector-laag",
  template: "<ng-content></ng-content>",
  encapsulation: ViewEncapsulation.None
})
export class KaartVectorLaagComponent implements OnInit, OnDestroy {
  @Input() titel = "";
  @Input() source = new ol.source.Vector();
  @Input() style: ol.style.Style;
  @Input() zichtbaar = true;
  @Input() selecteerbaar = true;

  vectorLaag: ol.layer.Vector;

  constructor(protected kaart: KaartComponent, protected zone: NgZone) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this.vectorLaag = this.maakVectorLayer();
      this.kaart.voegLaagToe(this.vectorLaag);
    });
  }

  ngOnDestroy(): void {
    this.zone.runOutsideAngular(() => {
      this.kaart.verwijderLaag(this.vectorLaag);
    });
  }

  maakVectorLayer(): ol.layer.Vector {
    return new ol.layer.Vector({
      source: this.source,
      style: this.style,
      visible: this.zichtbaar
    });
  }
}
