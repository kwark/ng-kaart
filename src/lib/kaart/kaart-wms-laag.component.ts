import { Component, Input, ViewEncapsulation } from "@angular/core";
import { List } from "immutable";

import * as ol from "openlayers";

import { KaartLaagComponent } from "./kaart-laag.component";
import { KaartClassicComponent } from "./kaart-classic.component";
import { WmsLaag, TiledWmsType } from "./kaart-elementen";
import { fromNullable } from "fp-ts/lib/Option";

@Component({
  selector: "awv-kaart-wms-laag",
  template: "<ng-content></ng-content>",
  encapsulation: ViewEncapsulation.None
})
export class KaartWmsLaagComponent extends KaartLaagComponent {
  @Input() laagNaam: string;
  @Input() urls: string[];
  @Input() tiled = true;
  @Input() type: string;
  @Input() versie?: string;
  @Input() format? = "image/png";
  @Input() tileSize? = 256;

  constructor(kaart: KaartClassicComponent) {
    super(kaart);
  }

  createLayer(): WmsLaag {
    return {
      type: TiledWmsType,
      titel: this.titel,
      naam: this.laagNaam,
      urls: List(this.urls),
      versie: fromNullable(this.versie),
      tileSize: fromNullable(this.tileSize),
      format: fromNullable(this.format)
    };
  }
}
