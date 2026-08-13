<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.34.0-Prizren" styleCategories="AllStyleCategories" hasScaleBasedVisibilityFlag="0" minScale="1e+08" maxScale="0">
  <renderer-v2 forceraster="0" graduatedMethod="GraduatedColor" type="graduatedSymbol" attr="risk" symbollevels="0" enableorderby="0">
    <ranges>
      <range lower="0.000000000000000" upper="25.000000000000000" symbol="0" label="0 - 25" render="true"/>
      <range lower="25.000000000000000" upper="50.000000000000000" symbol="1" label="25 - 50" render="true"/>
      <range lower="50.000000000000000" upper="90.000000000000000" symbol="2" label="50 - 90" render="true"/>
    </ranges>
    <symbols>
      <symbol type="fill" alpha="1" force_rhr="0" name="0" clip_to_extent="1">
        <layer locked="0" class="SimpleFill" enabled="1" pass="0">
          <Option type="Map">
            <Option name="color" value="68,1,84,255" type="QString"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="fill" alpha="1" force_rhr="0" name="1" clip_to_extent="1">
        <layer locked="0" class="SimpleFill" enabled="1" pass="0">
          <Option type="Map">
            <Option name="color" value="33,145,140,255" type="QString"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="fill" alpha="1" force_rhr="0" name="2" clip_to_extent="1">
        <layer locked="0" class="SimpleFill" enabled="1" pass="0">
          <Option type="Map">
            <Option name="color" value="253,231,37,255" type="QString"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
    <colorramp type="gradient" name="[source]">
      <Option type="Map">
        <Option name="color1" value="68,1,84,255" type="QString"/>
        <Option name="color2" value="253,231,37,255" type="QString"/>
        <Option name="rampType" value="gradient" type="QString"/>
      </Option>
    </colorramp>
    <classificationMethod id="EqualInterval">
      <symmetricMode enabled="0" symmetrypoint="0" astride="0"/>
      <labelFormat format="%1 - %2" labelprecision="0" trimtrailingzeroes="1"/>
    </classificationMethod>
    <rotation/>
    <sizescale/>
  </renderer-v2>
</qgis>
