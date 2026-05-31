import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Biblioteca / KMFX Edge",
  description: "Redireccion heredada hacia la biblioteca de KMFX Edge.",
};

export default function LibraryAliasPage() {
  redirect("/study");
}
