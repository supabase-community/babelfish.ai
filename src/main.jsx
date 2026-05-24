import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

import Broadcaster from './routes/broadcaster';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Broadcaster />
  </React.StrictMode>
);
