/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'shacl-engine/Validator.js' {
    import { DatasetCore, NamedNode } from '@rdfjs/types';

    export default class Validator {
        constructor(shapes: DatasetCore, options: { factory: any });

        validate(options: { dataset: DatasetCore }): Promise<{
            conforms: boolean;
            results: {
                path: any;
                message: string;
                severity: NamedNode;
                focusNode: NamedNode;
                sourceConstraintComponent: NamedNode;
            }[];
        }>;
    }
}

declare module '@rdfjs/data-model' {
    const dataModel: any;
    export default dataModel;
}

declare module '@rdfjs/dataset' {
    const dataset: any;
    export default dataset;
}

declare module 'rdf-canonize' {
    interface CanonizeOptions {
        algorithm?: string;
        inputFormat?: string;
        format?: string;
        skipExpansion?: boolean;
    }

    function canonize(
        data: string,
        options: CanonizeOptions
    ): Promise<string>;

    export = canonize;
}


declare module 'jsonld-document-loader' {
    export interface LoadedDocument {
        documentUrl: string;
        document: any;
        contextUrl?: string | null;
    }
    export class JsonLdDocumentLoader {
        constructor();
        setProtocolHandler(opts: {
        protocol: string;
        handler: (url: string) => Promise<LoadedDocument>;
        }): void;
        addStatic(url: string, document: any): void;
        build(): (url: string) => Promise<LoadedDocument>;
    }
}

