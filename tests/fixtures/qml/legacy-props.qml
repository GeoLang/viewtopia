<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.8.3-Zanzibar" hasScaleBasedVisibilityFlag="0" minScale="1e+08" maxScale="0">
  <renderer-v2 forceraster="0" graduatedMethod="GraduatedColor" type="graduatedSymbol" attr="risk" symbollevels="0" enableorderby="0">
    <ranges>
      <range lower="0.000000000000000" upper="50.000000000000000" symbol="0" label="0 - 50" render="true"/>
      <range lower="50.000000000000000" upper="90.000000000000000" symbol="1" label="50 - 90" render="true"/>
    </ranges>
    <symbols>
      <symbol type="fill" alpha="1" name="0" clip_to_extent="1">
        <layer pass="0" class="SimpleFill" locked="0">
          <prop k="color" v="68,1,84,255"/>
          <prop k="outline_color" v="35,35,35,255"/>
          <prop k="outline_width" v="0.26"/>
          <prop k="style" v="solid"/>
        </layer>
      </symbol>
      <symbol type="fill" alpha="1" name="1" clip_to_extent="1">
        <layer pass="0" class="SimpleFill" locked="0">
          <prop k="color" v="253,231,37,255"/>
          <prop k="style" v="solid"/>
        </layer>
      </symbol>
    </symbols>
    <mode name="quantile"/>
    <symmetricMode enabled="false" astride="false" symmetryPoint="1"/>
    <rotation/>
    <sizescale/>
  </renderer-v2>
</qgis>
