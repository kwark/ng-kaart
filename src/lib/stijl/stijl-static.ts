import * as ol from "openlayers";

import { validationChain as chain } from "../util/validation";

import { shortcutOrFullStyle } from "./json-awv-v0-stijl";
import { Validation } from "./json-object-interpreting";
import * as oi from "./json-object-interpreting";

// Door de beschrijvingsstijl in de kaartcomponent te steken, kunnen ook andere applicaties er gebruik van maken.
// Nog beter is om (op termijn) dit in een afzonderlijke module te steken.
// Best wachten we tot de interface min of meer stabiel is.

// Vanaf hier zou het iets stabieler moeten zijn
export type ValidatedOlStyle = Validation<ol.style.Style>;

export function definitieToStyle(encoding: string, definitieText: string): ValidatedOlStyle {
  if (encoding === "json") {
    return jsonDefinitieStringToStyle(definitieText);
  } else {
    return oi.fail(`Encoding '${encoding}' wordt niet ondersteund`);
  }
}

function jsonDefinitieStringToStyle(definitieText: string): ValidatedOlStyle {
  try {
    const object = JSON.parse(definitieText);
    return interpretJson(object);
  } catch (error) {
    return oi.fail(`De gegeven stijldefinitie was geen geldige JSON: ${error}`);
  }
}

function interpretJson(definition: Object): Validation<ol.style.Style> {
  return chain(oi.field("version", oi.str)(definition), version => {
    switch (version) {
      case "awv-v0":
        return shortcutOrFullStyle(definition);
      default:
        return oi.fail(`Versie '${version}' wordt niet ondersteund`);
    }
  });
}
