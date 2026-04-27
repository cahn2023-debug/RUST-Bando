import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export const MapSettingsPortal = ({ children }: { children: React.ReactNode }) => {
    const map = useMap();
    const [container, setContainer] = useState<Element | null>(null);

    useEffect(() => {
        // Find Leaflet's LayersControl list
        const findContainer = () => {
            const el = document.querySelector('.leaflet-control-layers-list');
            if (el) {
                // Check if our custom section already exists
                if (!el.querySelector('.custom-map-settings-wrapper')) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'custom-map-settings-wrapper';
                    // Stop map clicks from bleeding through
                    L.DomEvent.disableClickPropagation(wrapper);
                    L.DomEvent.disableScrollPropagation(wrapper);
                    el.appendChild(wrapper);
                    setContainer(wrapper);
                } else {
                    setContainer(el.querySelector('.custom-map-settings-wrapper'));
                }
            } else {
                // Retry if not yet rendered
                setTimeout(findContainer, 100);
            }
        };
        findContainer();
    }, [map]);

    return container ? createPortal(children, container) : null;
};
