import { Diagnostic, TextDocuments } from "vscode-languageserver/node.js";
import { DataManager } from "../../data/data-manager";
import { IRdfValidator } from "./irdf-validator";
import { TurtleValidator } from "./turtle/ttl-validator.js";
import { ShaclValidator } from "./shacl-validator.js";
import { ShapeManager } from "../../data/shacl/shape-manager";
import { JsonLdValidator } from "./jsonld/jsonld-validator.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RDFusionConfigSettings } from "../../utils/irdfusion-config-settings";
import { DEFAULT_SHACL_SELECTION } from "../../data/shacl/shacl-selection";
import { PerformanceTracer } from "../../utils/performance-trace.js";
import type { TermProvider } from "../autocomplete/term-completion/term-provider.js";

export class ValidationManager {
  private validator: IRdfValidator | undefined;
  private shaclValidator: ShaclValidator;
  private configSettings: RDFusionConfigSettings;

  constructor(
    private dataManager: DataManager,
    private shapeManager: ShapeManager,
    private documents: TextDocuments<TextDocument>,
    initialSettings: RDFusionConfigSettings,
    private tracer?: PerformanceTracer,
    private termProvider?: TermProvider,
  ) {
    this.shaclValidator = new ShaclValidator(this.shapeManager);
    this.configSettings = initialSettings;
  }

  async validate(uri: string): Promise<Diagnostic[]> {
    const run = async () => {
      const fileType = this.findFileFormat(uri);
      this.validator =
        fileType === "turtle"
          ? new TurtleValidator(
              this.dataManager,
              this.documents,
              this.configSettings,
              this.termProvider,
            )
          : new JsonLdValidator(
              this.dataManager,
              this.documents,
              this.configSettings,
              this.termProvider,
            );
      return this.validator.validate(
        uri,
        this.shaclValidator,
        this.configSettings.shacl?.selection ?? DEFAULT_SHACL_SELECTION,
      );
    };
    return this.tracer
      ? this.tracer.time("validation.document", run, { uri })
      : run();
  }

  findFileFormat(uri: string): string {
    return uri.toLowerCase().endsWith(".ttl")
      ? "turtle"
      : uri.toLowerCase().endsWith(".jsonld")
        ? "jsonld"
        : "unknown";
  }

  public updateSettings(newSettings: RDFusionConfigSettings) {
    this.configSettings = newSettings;
  }
}
