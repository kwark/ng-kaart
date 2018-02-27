import * as ol from "openlayers";
import { List, Map } from "immutable";
import { Option, none, some } from "fp-ts/lib/Option";

import * as ke from "./kaart-elementen";
import { KaartConfig } from "./kaart-config";

export class KaartWithInfo {
  constructor(
    // TODO om de distinctWithInfo te versnellen zouden we als eerste element een versieteller kunnen toevoegen
    readonly config: KaartConfig,
    readonly naam: String,
    readonly container: any,
    readonly map: ol.Map, // de volgende parameters worden geacht niet gezet te worden initieel (brrr)
    readonly lagenOpTitel: Map<string, Option<ol.layer.Base>> = Map(),
    readonly lagen: List<ke.Laag> = List(),
    readonly schaal: Option<ol.control.Control> = none,
    readonly fullScreen: Option<ol.control.FullScreen> = none,
    readonly stdInteracties: List<ol.interaction.Interaction> = List<ol.interaction.Interaction>(), // TODO beter gewoon interacties
    readonly middelpunt: Option<ol.Coordinate> = none,
    readonly zoom: Option<number> = none,
    readonly extent: Option<ol.Extent> = none,
    readonly size: Option<[number, number]> = none,
    readonly scrollZoomOnFocus = false,
    readonly showBackgroundSelector = false,
    readonly possibleBackgrounds: List<ke.WmsLaag | ke.BlancoLaag> = List(),
    readonly achtergrondlaagtitel: Option<string> = none
  ) {
    this.middelpunt = some(map.getView().getCenter());
    this.zoom = some(map.getView().getZoom());
    this.extent = some(map.getView().calculateExtent(map.getSize()));
    this.size = some(map.getSize());
  }
}
