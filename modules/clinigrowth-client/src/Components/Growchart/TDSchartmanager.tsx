import { useState } from "react";
import TDSC3yrs from "./TDSC3yrs";
import TDSCChart36 from "./DevelopmentScreen";
import TDSCChart0to6 from "./TDS0-6";

export default function TDSCChartManager() {
  const [activeChart, setActiveChart] = useState<"0-3" | "3-6" | "0-6">("0-3");

  const handleChartChange = (chart: "0-3" | "3-6" | "0-6") => {
    console.log("Manager received:", chart, "| current activeChart:", activeChart);
    setActiveChart(chart);
  };

  return (
    <div>
      {activeChart === "0-3" && <TDSC3yrs onChartChange={handleChartChange} />}
      {activeChart === "3-6" && <TDSCChart36 onChartChange={handleChartChange} />}
      {activeChart === "0-6" && <TDSCChart0to6 onChartChange={handleChartChange} />}
    </div>
  );
}