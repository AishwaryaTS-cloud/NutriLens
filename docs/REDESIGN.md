# NutriLens UI redesign: merge guide

Frontend only. `server/`, `ai/`, `docs/SCORING.md`, tests, scoring and Gemini code are unchanged.
Font: **Plus Jakarta Sans**, set once in `client/src/assets/styles/tokens.css` (`--font-sans`) and loaded in `client/index.html`.
Colours: every colour still comes from the original tokens in `tokens.css` (light and dark). No palette values were changed.

Root cause of the developer-style landing page: `Landing.jsx` rendered `StatusPanel` and the health hook, `Layout.jsx`
hardcoded a "Status" nav link and a "foundation build" footer, and `/` never redirected signed-in users.
Now `/` shows the landing page to visitors and redirects signed-in users to `/dashboard` (`HomeRoute` in `RouteGuards.jsx`).
The Design System page is still available only when `import.meta.env.DEV` is true.

## Changed or modified
- client/src/App.jsx differ
- client/src/assets/styles/base.css differ
- client/src/assets/styles/index.css differ
- client/src/assets/styles/layout.css differ
- client/src/assets/styles/pages.css differ
- client/src/assets/styles/tokens.css differ
- client/src/components/AnalysisView.jsx differ
- client/src/components/Icon.jsx differ
- client/src/components/ImageDropzone.jsx differ
- client/src/components/Layout.jsx differ
- client/src/components/PreferencesSummary.jsx differ
- client/src/components/RouteGuards.jsx differ
- client/src/context/AuthContext.jsx differ
- client/src/pages/Compare.jsx differ
- client/src/pages/Dashboard.jsx differ
- client/src/pages/DesignSystem.jsx differ
- client/src/pages/History.jsx differ
- client/src/pages/Landing.jsx differ
- client/src/pages/Login.jsx differ
- client/src/pages/NotFound.jsx differ
- client/src/pages/Preferences.jsx differ
- client/src/pages/Register.jsx differ
- client/src/pages/Scan.jsx differ
- client/src/pages/ScanDetail.jsx differ
- client/index.html

## Added
- client/src/assets/styles/app.css
- client/src/assets/styles/auth.css
- client/src/assets/styles/landing.css
- client/src/assets/styles/prefs.css
- client/src/assets/styles/results.css
- client/src/assets/styles/scan.css

## Removed
- client/src/assets/styles/analysis.css
- client/src/components/ScanPreview.jsx
- client/src/components/StatusPanel.jsx
- client/src/hooks/useHealth.js
