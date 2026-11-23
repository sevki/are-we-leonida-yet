import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

// shadcn themes via a `.dark` class; follow the OS setting
const mq = window.matchMedia("(prefers-color-scheme: dark)")
const sync = () => document.documentElement.classList.toggle("dark", mq.matches)
sync()
mq.addEventListener("change", sync)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
