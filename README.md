# RDFusion

RDFusion brings RDF editing and validation directly into VS Code. Whether you’re working with Turtle or JSON-LD 1.1, RDFusion:

- Highlights **inline syntax errors** as you type  
- Runs and highlights **SHACL shape validation** against your data model as you type 
- **Suggests vocabulary terms** (e.g. `foaf:`, `schema:`, `rdf:`) from both local files and remote registries  
- Lets you **group triples by subject** into compact blocks for readability as well as **filter triples** based on user input specification

## Features & Commands

### Inline Syntax & SHACL Validation
- RDFusion parses your Turtle and JSON-LD and flags errors and warnings inline right in the editor .
- RUN **“RDFusion: Toggle Turtle Validations”** and **“RDFusion: Toggle JSONLD Validations”** to enable and disable validation types.

### Prefix Suggestions
- As you start declaring prefix, RDFusion gives suggestions. RDFusion also gives an option to automatically declare prefix, after usage of undeclared prefix.

### Vocabulary Completion
As you type prefix names, RDFusion suggests terms from:
- **Local workspace** graphs  
- **Remote registries** (LOV API, Direct Dereference)  
- RUN **“RDFusion: Toggle Autocomplete”** to switch term completion between local, remote, or both sources. Also to enable/disable declaration of undeclared prefix.

### Triple Management  
- RUN **“RDFusion: Group by Subject”** to transform flat Turtle into grouped blocks.
- RUN **“RDFusion: Filter Triples”** to filter triples based on user specified subject, predicate, and object; supporting both full IRIs and prefixed names, as well as literal values. Filtered triples are shown in new untitled VS Code editor tab. 
- RUN **“RDFusion: Generate VoID”** to generate a Vocabulary of Interlinked Datasets. It will generate void:triples, void:distinctSubjects, void:distinctObjects, void:properties, void:propertyPartition, void:classPartition, and void:vocabulary for your current open ttl or jsonld file.
- RUN **“RDFusion: Toggle IRI Shortening”** to enable/disable IRI shortening and expansion in Turtle. Once enabled you can shorten and expand each IRI inside the editor.
- RUN **“RDFusion: Set IRI Shorten Length”** to set the maximum length before applying IRI shortening in Turtle.
- RUN **“RDFusion: Merge Files”** to merge the current open ttl/jsonld file with another ttl or jsonld file. The merged data is grouped and shown in new untitled VS Code editor tab.