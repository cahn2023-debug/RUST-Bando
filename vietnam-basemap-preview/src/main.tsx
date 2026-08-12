import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BasemapPreviewApp } from './BasemapPreviewApp';
import { StreetViewPreviewApp } from './StreetViewPreviewApp';
import './styles.css';

const app = new URLSearchParams(window.location.search).get('view') === 'streetview'
    ? <StreetViewPreviewApp />
    : <BasemapPreviewApp />;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {app}
    </StrictMode>,
);
