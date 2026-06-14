import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calculadora / KMFX Edge",
  description: "Calcula lotaje y riesgo operativo en KMFX Edge.",
};

export { default } from "../tools/calculator/page";
