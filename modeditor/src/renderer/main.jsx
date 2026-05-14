import React from 'react';
import { createRoot } from 'react-dom/client';
import { FocusStyleManager } from '@blueprintjs/core';

import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import './app.css';

import { App } from './App.jsx';

FocusStyleManager.onlyShowFocusOnTabs();

const root = createRoot(document.getElementById('root'));
root.render(<App />);
