"use client";

import { useEffect } from "react";

import { ensureDemoAssessment } from "@/lib/demo-assessment";

export function DemoAssessmentBootstrap() {
  useEffect(() => {
    void ensureDemoAssessment();
  }, []);
  return null;
}
