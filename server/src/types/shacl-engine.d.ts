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
