/** Priority companies and their official or explicitly labelled media sources. */
export const AIDC_COMPANIES = [
  { id: "simplo", name: "新普科技", sources: ["simplo-news"], pattern: /\bsimplo\b|新普/iu },
  { id: "aes", name: "AES-KY", sources: ["aes-news", "aes-media"], pattern: /AES[-\s]?KY|Advanced Energy Solution|AES Holding/iu },
  { id: "dynapack", name: "顺达", sources: ["dynapack-news", "dynapack-media"], pattern: /dynapack|順達|顺达/iu },
  { id: "delta", name: "台达", sources: ["delta-press", "delta-brandnews"], pattern: /Delta Electronics|台達|台达/iu },
  { id: "liteon", name: "光宝", sources: ["liteon-news", "liteon-media"], pattern: /lite[-\s]?on|光寶|光宝/iu },
  { id: "stl", name: "新盛力", sources: ["stl-news"], pattern: /新盛力|STL Technology|STL Battery/iu },
  { id: "nvidia", name: "NVIDIA", sources: ["nvidia-news", "nvidia-blog", "nvidia-developer", "nvidia-research"], pattern: /NVIDIA|英伟达|輝達|英偉達/iu },
  { id: "ocp", name: "OCP", sources: ["ocp-blog", "ocp-whitepapers"], pattern: /Open Compute Project|\bOCP\b/iu },
] as const;
