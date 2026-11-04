import EditableLawnMap from '@/components/scan/EditableLawnMap';

export default function SatelliteMethod({ center, zoom, lotSizeSqft, lotOutline, initialShapes, initialTrees, initialBushes, initialBuildings, measuredSqft, onResult }) {
    return (
    <EditableLawnMap
      center={center}
      zoom={zoom}
      lotSizeSqft={lotSizeSqft}
      lotOutline={lotOutline}
      initialShapes={initialShapes}
      initialTrees={initialTrees}
      initialBushes={initialBushes}
      initialBuildings={initialBuildings}
      measuredSqft={measuredSqft ?? null}
      onResult={onResult}
    />
  );
}