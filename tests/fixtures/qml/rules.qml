<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.28.0-Firenze" styleCategories="AllStyleCategories" hasScaleBasedVisibilityFlag="0" minScale="1e+08" maxScale="0">
  <renderer-v2 type="RuleRenderer" forceraster="0" symbollevels="0" enableorderby="0">
    <rules key="renderer_rules">
      <rule key="renderer_rule_0" symbol="0" label="high risk" filter="&quot;risk&quot; &gt;= 80" scalemindenom="100" scalemaxdenom="2000"/>
      <rule key="renderer_rule_1" symbol="1" label="water" filter="&quot;type&quot; = 'water'"/>
      <rule key="renderer_rule_2" symbol="2" label="everything else" filter="ELSE"/>
    </rules>
    <symbols>
      <symbol type="line" alpha="1" force_rhr="0" name="0" clip_to_extent="1">
        <layer locked="0" class="SimpleLine" enabled="1" pass="0">
          <Option type="Map">
            <Option name="capstyle" value="square" type="QString"/>
            <Option name="line_color" value="225,87,89,255" type="QString"/>
            <Option name="line_style" value="solid" type="QString"/>
            <Option name="line_width" value="0.26" type="QString"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="line" alpha="1" force_rhr="0" name="1" clip_to_extent="1">
        <layer locked="0" class="SimpleLine" enabled="1" pass="0">
          <Option type="Map">
            <Option name="line_color" value="78,121,167,255" type="QString"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="line" alpha="1" force_rhr="0" name="2" clip_to_extent="1">
        <layer locked="0" class="SimpleLine" enabled="1" pass="0">
          <Option type="Map">
            <Option name="line_color" value="200,200,200,255" type="QString"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
  </renderer-v2>
</qgis>
