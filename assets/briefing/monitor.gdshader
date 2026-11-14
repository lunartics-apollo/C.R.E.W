shader_type canvas_item;
render_mode unshaded;
uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;
uniform float power : hint_range(0.0, 1.0) = 1.0;
uniform float interference : hint_range(0.0, 1.0) = 0.0;
uniform float motion = 1.0;
uniform float clock = 0.0;

void fragment() {
	float row = floor(FRAGCOORD.y);
	float noise = fract(sin(dot(vec2(row, floor(clock * 18.0)), vec2(12.9898, 78.233))) * 43758.5453);
	float shift = step(0.94, noise) * (noise - 0.5) * interference * motion * 4.0;
	vec2 sample_uv = SCREEN_UV + vec2(shift * SCREEN_PIXEL_SIZE.x, 0.0);
	vec3 col = texture(screen_texture, sample_uv).rgb;
	col *= 0.965 + mod(row, 2.0) * 0.035;
	col += vec3(0.15, 0.3, 0.25) * noise * interference * motion * 0.22;
	float opening = step(abs(UV.y - 0.5), power * 0.5);
	col *= opening * power;
	col += vec3(0.58, 0.83, 0.72) * (1.0 - smoothstep(0.0, 0.014, abs(abs(UV.y - 0.5) - power * 0.5))) * (1.0 - power) * opening;
	COLOR = vec4(col, 1.0);
}
