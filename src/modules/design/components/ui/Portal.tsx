import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
    children: React.ReactNode;
    id?: string;
}

export const Portal: React.FC<PortalProps> = ({ children, id = 'portal-root' }) => {
    const [container, setContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        let portalRoot = document.getElementById(id);

        if (!portalRoot) {
            portalRoot = document.createElement('div');
            portalRoot.id = id;
            document.body.appendChild(portalRoot);
        }

        setContainer(portalRoot);
    }, [id]);

    if (!container) return null;

    return createPortal(children, container);
};
