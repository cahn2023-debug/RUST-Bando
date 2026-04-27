# I18N Implementation Guide

## Overview

This project uses **i18next** with **react-i18next** for internationalization. The setup supports Vietnamese (`vi`) and English (`en`) languages, with Vietnamese as the default fallback.

## Architecture

### File Structure

```
src/
  i18n/
    index.ts                    # i18next initialization
    locales/
      vi/
        common.json             # Vietnamese translations
      en/
        common.json             # English translations
```

### Key Dependencies

- `i18next` - Core i18n library
- `react-i18next` - React bindings (hooks, HOC, Suspense support)
- `i18next-browser-languagedetector` - Automatic language detection

## How Translations Work

### 1. Initialization

i18n is initialized in `src/i18n/index.ts` and imported once at the app entry point:

```tsx
// src/HOME/main.tsx
import "@TOOL/../i18n"; // Side-effect import initializes i18n
```

The configuration:
- Uses `localStorage` as the primary language detector, falling back to browser language
- Caches the selected language in `localStorage` under the key `i18nextLng`
- Falls back to Vietnamese (`vi`) if no language is detected
- Supports `useSuspense` for React lazy loading

### 2. Using Translations in Components

#### Functional Components (Preferred)

Use the `useTranslation` hook:

```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t, i18n } = useTranslation();

  return (
    <div>
      <h1>{t("common.save")}</h1>
      <p>{t("project.newProject")}</p>
    </div>
  );
}
```

#### Class Components

Class components (like `ErrorBoundary`) cannot use hooks. Import the i18n instance directly:

```tsx
import i18n from "@TOOL/../i18n";

const t = (key: string): string => i18n.t(key);

class MyErrorBoundary extends Component<Props, State> {
  render() {
    return <h1>{t("errors.generic")}</h1>;
  }
}
```

### 3. Translation Key Structure

Keys are organized by namespace in JSON files:

| Namespace | Purpose | Example Keys |
|-----------|---------|--------------|
| `common` | Shared UI elements | `common.save`, `common.cancel`, `common.search` |
| `project` | Project management | `project.newProject`, `project.status`, `project.active` |
| `map` | Map features | `map.layers`, `map.zoomIn`, `map.coordinates` |
| `design` | Design tools | `design.camera`, `design.point`, `design.visible` |
| `settings` | App settings | `settings.language`, `settings.theme`, `settings.dark` |
| `errors` | Error messages | `errors.generic`, `errors.notFound`, `errors.saveFailed` |

### 4. Key Syntax

- Use dot notation: `t("namespace.keyName")`
- Keys use camelCase: `newProject`, `zoomIn`, `saveFailed`
- Nested keys are supported: `t("errors.deleteConfirm")`

## Language Switching

### LanguageSwitcher Component

The `LanguageSwitcher` component (`src/DESIGN/components/ui/LanguageSwitcher.tsx`) provides a dropdown for switching between Vietnamese and English:

- Shows the current language with a flag emoji
- Persists the selection to `localStorage` automatically
- Uses `i18n.changeLanguage()` for runtime switching
- Components re-render automatically when language changes

### Programmatic Switching

```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { i18n } = useTranslation();

  const switchToEnglish = () => {
    i18n.changeLanguage("en");
  };

  const switchToVietnamese = () => {
    i18n.changeLanguage("vi");
  };
}
```

Or using the helper from `src/i18n/index.ts`:

```tsx
import { changeLanguage } from "@TOOL/../i18n";

await changeLanguage("en");
```

## Adding New Translation Keys

### Step 1: Add to Both Language Files

Add the key to **both** `src/i18n/locales/vi/common.json` and `src/i18n/locales/en/common.json`:

**en/common.json:**
```json
{
  "myFeature": {
    "title": "My Feature",
    "description": "Feature description"
  }
}
```

**vi/common.json:**
```json
{
  "myFeature": {
    "title": "Tính năng của tôi",
    "description": "Mô tả tính năng"
  }
}
```

### Step 2: Use in Components

```tsx
const { t } = useTranslation();

<h1>{t("myFeature.title")}</h1>
<p>{t("myFeature.description")}</p>
```

## Missing Key Handling

When a key is missing, i18next returns the key itself as the fallback string. For example:

```tsx
t("nonexistent.key") // Returns "nonexistent.key"
```

In development mode (`import.meta.env.DEV`), missing keys are logged to the console.

### Best Practice

Always add keys to **both** language files simultaneously to avoid inconsistent behavior.

## Suspense Integration

The i18n configuration has `react.useSuspense: true`. Wrap lazy-loaded components with a `Suspense` boundary:

```tsx
import { Suspense, lazy } from "react";

const MyComponent = lazy(() => import("./MyComponent"));

<Suspense fallback={<LoadingFallback />}>
  <MyComponent />
</Suspense>
```

The app entry point (`src/HOME/main.tsx`) already includes a `Suspense` boundary.

## Best Practices for Developers

1. **Always use `t()` for user-facing text** -- Never hardcode strings in components
2. **Use descriptive key names** -- `project.saveFailed` is better than `err1`
3. **Group keys by feature** -- Use namespaces (`map.*`, `design.*`, `settings.*`)
4. **Keep keys consistent** -- Use the same key for the same concept across components
5. **Test both languages** -- Switch between Vietnamese and English during development
6. **Avoid string concatenation** -- Use interpolation for dynamic values:
   ```tsx
   // Instead of:
   <span>{t("common.save")} - {projectName}</span>

   // Use interpolation in the JSON:
   // "saveProject": "Save {{name}}"
   t("project.saveProject", { name: projectName })
   ```
7. **Use `t()` in attributes too** -- `title`, `aria-label`, `placeholder` should all be translated
8. **Class components use `i18n.t()` directly** -- Import the instance, not the hook
9. **Do not translate technical terms** -- Keep IDs, paths, and codes as-is
10. **Keep translation files in sync** -- When adding a key, add it to all language files

## Troubleshooting

### Translations Not Showing

1. Verify `import "@TOOL/../i18n"` is present in `main.tsx`
2. Check that the key exists in both `vi/common.json` and `en/common.json`
3. Ensure the component is wrapped in a React tree where `useTranslation` can access context

### Language Not Persisting

The language is stored in `localStorage` under `i18nextLng`. Clear it with:
```js
localStorage.removeItem("i18nextLng");
```

### Class Component Not Translating

Ensure you import the i18n instance correctly:
```tsx
import i18n from "@TOOL/../i18n";
// NOT: import i18n from "i18next";
```
