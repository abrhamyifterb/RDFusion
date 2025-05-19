# RDFusion

RDFusion brings RDF editing and validation directly into VS Code. Whether you’re working with Turtle or JSON-LD 1.1, RDFusion:

- Highlights **inline syntax errors** as you type  
- Runs and highlights **SHACL shape validation** against your data model as you type 
- **Suggests vocabulary terms** (e.g. `foaf:`, `schema:`, `rdf:`) from both local files and remote registries  
- Lets you **group triples by subject** into compact blocks for readability  

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

### Triiple Management  
- RUN **“RDFusion: Group by Subject”** to transform flat Turtle into grouped blocks.
- RUN **“RDFusion: Filter Triples”** to filter triples based on user specified subject, predicate, and object; supporting both full IRIs and prefixed names, as well as literal values. Filtered triples are shown in new untitled VS Code editor tab. 

