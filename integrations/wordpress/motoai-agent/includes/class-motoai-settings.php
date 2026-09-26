<?php
/**
 * MotoAI Agent — Settings API page (Settings → MotoAI Agent).
 *
 * Security: capability checks (manage_options), nonce via Settings API,
 * every input sanitized on save, every output escaped on render.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MotoAI_Settings {

	const PAGE    = 'motoai-agent';
	const GROUP   = 'motoai_agent_group';
	const SECTION = 'motoai_agent_section';

	public static function init() {
		register_setting(
			self::GROUP,
			MOTOAI_AGENT_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => 'motoai_agent_sanitize_settings',
				'default'           => motoai_agent_defaults(),
				'show_in_rest'      => false,
			)
		);

		add_settings_section(
			self::SECTION,
			'Cấu hình widget',
			array( __CLASS__, 'section_text' ),
			self::PAGE
		);

		$fields = array(
			'enabled'         => 'Bật Agent',
			'lang'            => 'Ngôn ngữ (vi/en)',
			'theme'           => 'Giao diện (auto/light/dark)',
			'position'        => 'Vị trí (bottom-right/bottom-left)',
			'title'           => 'Tiêu đề widget',
			'source'          => 'Nhãn nguồn (source)',
			'auto_open'       => 'Tự động mở',
			'auto_open_delay' => 'Độ trễ tự mở (ms, 0–10000)',
			'show_mobile'     => 'Hiện trên mobile',
			'show_desktop'    => 'Hiện trên desktop',
			'include_pages'   => 'Chỉ hiện trên các trang (page IDs)',
			'exclude_pages'   => 'Không hiện trên các trang (page IDs)',
		);
		foreach ( $fields as $key => $label ) {
			add_settings_field(
				'motoai_agent_' . $key,
				$label,
				array( __CLASS__, 'field_' . $key ),
				self::PAGE,
				self::SECTION,
				array( 'label_for' => 'motoai-agent-' . $key )
			);
		}
	}

	public static function register() {
		// noop placeholder for readability in the main plugin file.
	}

	private static function s() {
		return motoai_agent_settings();
	}

	public static function section_text() {
		echo '<p>';
		esc_html_e( 'Plugin chỉ tải widget MotoAI từ GitHub Pages. Không có API key, không backend. Cập nhật Agent trên GitHub Pages không cần cài lại plugin.', 'motoai-agent' );
		echo '</p>';
	}

	public static function render() {
		if ( ! current_user_can('manage_options') ) {
			wp_die( esc_html__( 'Bạn không có quyền truy cập trang này.', 'motoai-agent' ) );
		}
		echo '<div class="wrap"><h1>' . esc_html__( 'MotoAI Agent', 'motoai-agent' ) . '</h1>';
		echo '<form method="post" action="options.php">';
		settings_fields( self::GROUP );
		do_settings_sections( self::PAGE );
		submit_button();
		echo '</form></div>';
	}

	public static function field_enabled() {
		$s = self::s();
		printf(
			'<input type="checkbox" id="motoai-agent-enabled" name="%s[enabled]" value="1" %s />',
			esc_attr( MOTOAI_AGENT_OPTION ),
			checked( ! empty( $s['enabled'] ), true, false )
		);
	}

	private static function select_field( $key, $options ) {
		$s = self::s();
		printf(
			'<select id="motoai-agent-%1$s" name="%2$s[%1$s]">',
			esc_attr( $key ),
			esc_attr( MOTOAI_AGENT_OPTION )
		);
		foreach ( $options as $value => $label ) {
			printf(
				'<option value="%s" %s>%s</option>',
				esc_attr( $value ),
				selected( $s[ $key ], $value, false ),
				esc_html( $label )
			);
		}
		echo '</select>';
	}

	public static function field_lang()    { self::select_field( 'lang', array( 'vi' => 'vi', 'en' => 'en' ) ); }
	public static function field_theme()   { self::select_field( 'theme', array( 'auto' => 'auto', 'light' => 'light', 'dark' => 'dark' ) ); }
	public static function field_position(){ self::select_field( 'position', array( 'bottom-right' => 'bottom-right', 'bottom-left' => 'bottom-left' ) ); }

	public static function field_title() {
		printf(
			'<input type="text" id="motoai-agent-title" name="%s[title]" value="%s" maxlength="40" class="regular-text" />',
			esc_attr( MOTOAI_AGENT_OPTION ),
			esc_attr( self::s()['title'] )
		);
	}

	public static function field_source() {
		printf(
			'<input type="text" id="motoai-agent-source" name="%s[source]" value="%s" maxlength="64" class="regular-text" />',
			esc_attr( MOTOAI_AGENT_OPTION ),
			esc_attr( self::s()['source'] )
		);
		echo '<p class="description">' . esc_html__( 'Nhãn phân biệt kênh phân phối (wordpress, pwa, zalo...). Không chứa thông tin cá nhân.', 'motoai-agent' ) . '</p>';
	}

	public static function field_auto_open() {
		printf(
			'<input type="checkbox" id="motoai-agent-auto-open" name="%s[auto_open]" value="1" %s />',
			esc_attr( MOTOAI_AGENT_OPTION ),
			checked( ! empty( self::s()['auto_open'] ), true, false )
		);
	}

	public static function field_auto_open_delay() {
		printf(
			'<input type="number" id="motoai-agent-auto-open-delay" name="%s[auto_open_delay]" value="%d" min="0" max="10000" step="500" />',
			esc_attr( MOTOAI_AGENT_OPTION ),
			absint( self::s()['auto_open_delay'] )
		);
	}

	public static function field_show_mobile() {
		printf(
			'<input type="checkbox" id="motoai-agent-show-mobile" name="%s[show_mobile]" value="1" %s />',
			esc_attr( MOTOAI_AGENT_OPTION ),
			checked( ! empty( self::s()['show_mobile'] ), true, false )
		);
	}

	public static function field_show_desktop() {
		printf(
			'<input type="checkbox" id="motoai-agent-show-desktop" name="%s[show_desktop]" value="1" %s />',
			esc_attr( MOTOAI_AGENT_OPTION ),
			checked( ! empty( self::s()['show_desktop'] ), true, false )
		);
	}

	private static function pages_field( $key ) {
		printf(
			'<input type="text" id="motoai-agent-%1$s" name="%2$s[%1$s]" value="%3$s" class="regular-text" placeholder="vd: 3, 12" />',
			esc_attr( $key ),
			esc_attr( MOTOAI_AGENT_OPTION ),
			esc_attr( self::s()[ $key ] )
		);
	}

	public static function field_include_pages() { self::pages_field( 'include_pages' ); }
	public static function field_exclude_pages() { self::pages_field( 'exclude_pages' ); }
}