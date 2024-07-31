import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

import Broadcaster from './routes/broadcaster';
import Receiver from './routes/receiver';
import './index.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const router = createHashRouter([
  {
    path: '/receiver/:channelId',
    element: <Receiver supabase={supabase} />,
  },
  {
    path: '/*',
    element: <Broadcaster supabase={supabase} />,
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
