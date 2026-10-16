import { useEffect, useRef } from "react";
import type { EChartsCoreOption } from "echarts/core";
export default function Chart({
  option,
  label,
}: {
  option: EChartsCoreOption;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let chart: import("echarts/core").ECharts | undefined;
    let alive = true;
    let observer: ResizeObserver | undefined;
    (async () => {
      const [e, c, g, r] = await Promise.all([
        import("echarts/core"),
        import("echarts/charts"),
        import("echarts/components"),
        import("echarts/renderers"),
      ]);
      if (!alive || !ref.current) return;
      e.use([
        c.LineChart,
        c.BarChart,
        g.GridComponent,
        g.TooltipComponent,
        g.LegendComponent,
        g.AriaComponent,
        r.CanvasRenderer,
      ]);
      chart = e.init(ref.current);
      chart.setOption(option);
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
    })();
    return () => {
      alive = false;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [option]);
  return <div ref={ref} role="img" aria-label={label} className="chart" />;
}
