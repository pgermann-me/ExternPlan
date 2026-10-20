export const polygonId=region=>Object.hasOwn(region,'polygon_geo_id')?region.polygon_geo_id:region.id;
export function polygonCatalog({layers}){
 const entries=new Map();for(const layer of layers)for(const feature of layer.geojson.features){const id=String(feature.properties.GEO_ID);if(!entries.has(id))entries.set(id,{id,name:feature.properties.Beschreibung||id,layer:layer.name});}return [...entries.values()];
}
export function regionPolygonLayers(data,region){
 const id=polygonId(region);return data.layers.map(layer=>({...layer,geojson:{...layer.geojson,features:layer.geojson.features.filter(f=>String(f.properties.GEO_ID)===id)}})).filter(layer=>layer.geojson.features.length);
}
