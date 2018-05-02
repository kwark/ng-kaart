import { CommonModule } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { ModuleWithProviders, NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HttpModule } from "@angular/http";
import { MatFormFieldModule, MatIconModule, MatInputModule } from "@angular/material";

import { CrabZoekerComponent } from "./crab-zoeker.component";
import { CrabZoekerService } from "./crab-zoeker.service";
import { GoogleWdbLocatieZoekerComponent } from "./google-wdb-locatie-zoeker.component";
import { GoogleWdbLocatieZoekerService } from "./google-wdb-locatie-zoeker.service";
import { ZoekerHighlightPipe } from "./zoeker-highlight.pipe";
import { ZoekerInjectorComponent } from "./zoeker-injector.component";
import { DefaultRepresentatieService, ZOEKER_REPRESENTATIE } from "./zoeker-representatie.service";
import { ZoekerComponent } from "./zoeker.component";
import { ZOEKER_CFG, ZoekerConfigData } from "./zoeker.config";

const components: any[] = [
  GoogleWdbLocatieZoekerComponent,
  CrabZoekerComponent,
  ZoekerComponent,
  ZoekerHighlightPipe,
  ZoekerInjectorComponent
];

@NgModule({
  imports: [CommonModule, HttpModule, HttpClientModule, ReactiveFormsModule, MatIconModule, MatInputModule, MatFormFieldModule],
  declarations: [components],
  entryComponents: [ZoekerInjectorComponent],
  exports: [components],
  providers: [GoogleWdbLocatieZoekerService, CrabZoekerService]
})
export class ZoekerModule {
  static forRoot(config: ZoekerConfigData): ModuleWithProviders {
    return {
      ngModule: ZoekerModule,
      providers: [{ provide: ZOEKER_CFG, useValue: config }, { provide: ZOEKER_REPRESENTATIE, useClass: DefaultRepresentatieService }]
    };
  }
}

export * from "./google-wdb-locatie-zoeker.service";
export * from "./google-wdb-locatie-zoeker.component";
export * from "./google-wdb-locatie-zoeker.config";

export * from "./crab-zoeker.service";
export * from "./crab-zoeker.component";
export * from "./crab-zoeker.config";

export * from "./zoeker-highlight.pipe";
export * from "./zoeker.component";
export * from "./abstract-zoeker";
export * from "./zoeker-representatie.service";
