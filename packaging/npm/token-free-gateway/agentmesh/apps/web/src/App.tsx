import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { SECTIONS } from "./routes/section-config";

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      ...SECTIONS.map((section) => ({
        path: section.path,
        element: <section.component />,
      })),
      // Unknown paths fall back to the dashboard.
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
