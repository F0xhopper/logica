import "@xyflow/react/dist/base.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { MapRoute } from "./screens/MapScreen.tsx";
import { NotFound } from "./screens/NotFound.tsx";
import { PasteScreen } from "./screens/PasteScreen.tsx";

const router = createBrowserRouter([
  { path: "/", element: <PasteScreen /> },
  { path: "/map/:id", element: <MapRoute /> },
  { path: "*", element: <NotFound message="Nothing here." /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
