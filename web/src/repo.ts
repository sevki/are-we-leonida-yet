import { createContext, useContext } from "react"

/** The tracked repository's current name (from the snapshot), so links follow a rename or transfer. */
export const RepoContext = createContext<string>("")
export const useRepo = () => useContext(RepoContext)
export const repoUrl = (repo: string, path = "") => `https://github.com/${repo}${path}`
