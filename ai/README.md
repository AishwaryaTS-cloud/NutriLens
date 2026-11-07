# ai/ : OCR and label analysis pipeline

Folder layout follows the synopsis. Each folder is filled in during its planned phase; Phase 0
contains no pipeline code.

| Folder | Planned content | Planned phase |
|---|---|---|
| `ocr/` | `imagePreprocessor.js` (Sharp), `ocrService.js` (Tesseract.js) | 3-6 |
| `parsers/` | nutrition, ingredient and claim parsers | 3-6 |
| `allergens/` | `allergenDetector.js` | 3-6 |
| `scoring/` | `matchScore.js` (Personal Match Score, Label Quality Score) | 3-6 |
| `rag/` | retriever, embeddings, generator (Gemini) | 7-10 |
| `knowledge-base/` | food and nutrition information | 7-10 |
| `workflow/` | `analysisWorkflow.js` (LangGraph or custom, to be confirmed) | 7-10 |
| `labelAnalysis.js` | main analysis entry point | 3-6 |
