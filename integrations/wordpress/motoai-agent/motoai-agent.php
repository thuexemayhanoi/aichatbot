<?php
/**
 * Plugin Name:       MotoAI Agent
 * Plugin URI:        https://thuexemayhanoi.github.io/aichatbot/
 * Description:       Lightweight loader for the MotoAI motorbike-rental chatbot (local-first, no API key). Loads the canonical embed widget from GitHub Pages; the chat engine itself is never bundled.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Thuê Xe Máy Hà Nội Nguyễn Tú
 * Author URI:        https://thuexemayhanoi.github.io/aichatbot/
 * License:           GPL-2.0-or-later
 * Text Domain:       motoai-agent
 *
 * The plugin is a thin, safe configuration + loader layer. All chat logic
 * (rules, retrieval, calculator, recommendation) lives in the canonical
 * GitHub Pages app. Updating the Agent on GitHub Pages does NOT require
 * reinstalling this plugin.
 */

// Do not allow direct access.
defined('ABSPATH') || exit;

define( 'MOTOAI_AGENT_VERSION', '1.0.0' );
define( 'MOTOAI_AGENT_OPTION', 'motoai_agent_settings' );
// Canonical, version-less embed URL: always current published Agent.
define( 'MOTOAI_AGENT_EMBED_URL', 'https://thuexemayhanoi.github.io/aichatbot/embed.js' );

require_once plugin_dir_path( __FILE__ ) . 'includes/class-motoai-settings.php';

/**
 * Default settings. Every value is validated again on save and on output.
 */
function motoai_agent_defaults() {
	return array(
		'enabled'        => 1,
		'lang'           => 'vi',
		'theme'          => 'auto',
		'position'       => 'bottom-right',
		'title'          => 'MotoAI',
		'source'         => 'wordpress',
		'auto_open'      => 0,
		'auto_open_delay'=> 0,
		'show_mobile'    => 1,
		'show_desktop'   => 1,
		'include_pages'  => '',
		'exclude_pages'  => '',
	);
}

/**
 * Sanitize one settings array (used by the Settings API and any save path).
 */
function motoai_agent_sanitize_settings( $input ) {
	$defaults = motoai_agent_defaults();
	if ( ! is_array( $input ) ) {
		return $defaults;
	}
	$clean = array();

	$clean['enabled']         = empty( $input['enabled'] ) ? 0 : 1;
	$clean['show_mobile']     = empty( $input['show_mobile'] ) ? 0 : 1;
	$clean['show_desktop']    = empty( $input['show_desktop'] ) ? 0 : 1;

	$clean['lang']    = ( isset( $input['lang'] ) && 'en' === $input['lang'] ) ? 'en' : 'vi';
	$clean['theme']   = ( isset( $input['theme'] ) && in_array( $input['theme'], array( 'light', 'dark' ), true ) )
		? $input['theme'] : 'auto';
	$clean['position']= ( isset( $input['position'] ) && 'bottom-left' === $input['position'] )
		? 'bottom-left' : 'bottom-right';

	$clean['title']  = sanitize_text_field( $input['title'] ?? $defaults['title'] );
	if ( '' === $clean['title'] ) {
		$clean['title'] = $defaults['title'];
	}

	// Source label: no personal data, ascii-ish slug, max 64 chars (embed contract).
	$clean['source'] = isset( $input['source'] )
		? substr( preg_replace( '/[^a-z0-9-_]/', '', sanitize_key( $input['source'] ) ), 0, 64 )
		: $defaults['source'];
	if ( '' === $clean['source'] ) {
		$clean['source'] = $defaults['source'];
	}

	// Auto-open delay in ms, 0..10000 (embed.js clamps too).
	$clean['auto_open']       = empty( $input['auto_open'] ) ? 0 : 1;
	$clean['auto_open_delay'] = max( 0, min( 10000, absint( $input['auto_open_delay'] ?? 0 ) ) );

	$clean['include_pages'] = motoai_agent_sanitize_page_list( $input['include_pages'] ?? '' );
	$clean['exclude_pages'] = motoai_agent_sanitize_page_list( $input['exclude_pages'] ?? '' );

	return $clean;
}

/**
 * "1, 12, about-us" -> "1,12" (numeric page IDs only, deduplicated).
 */
function motoai_agent_sanitize_page_list( $raw ) {
	$parts = explode( ',', sanitize_text_field( (string) $raw ) );
	$ids   = array();
	foreach ( $parts as $part ) {
		$id = absint( trim( $part ) );
		if ( $id > 0 ) {
			$ids[ $id ] = true;
		}
	}
	$ids = array_keys( $ids );
	sort( $ids, SORT_NUMERIC );
	return implode( ',', $ids );
}

/**
 * Current effective settings (defaults merged with saved option).
 */
function motoai_agent_settings() {
	$saved = get_option( MOTOAI_AGENT_OPTION, array() );
	if ( ! is_array( $saved ) ) {
		$saved = array();
	}
	return array_merge( motoai_agent_defaults(), motoai_agent_sanitize_settings( $saved ) );
}

/**
 * Page visibility rules (include/exclude page IDs + device classes).
 */
function motoai_agent_is_visible() {
	$s = motoai_agent_settings();
	if ( empty( $s['enabled'] ) ) {
		return false;
	}

	$is_mobile = wp_is_mobile();
	if ( $is_mobile && empty( $s['show_mobile'] ) ) {
		return false;
	}
	if ( ! $is_mobile && empty( $s['show_desktop'] ) ) {
		return false;
	}

	$page_id  = is_singular() ? get_queried_object_id() : 0;
	$include  = array_filter( array_map( 'absint', explode( ',', $s['include_pages'] ) ) );
	$exclude  = array_filter( array_map( 'absint', explode( ',', $s['exclude_pages'] ) ) );

	if ( ! empty( $include ) && ! in_array( $page_id, $include, true ) ) {
		return false;
	}
	if ( in_array( $page_id, $exclude, true ) ) {
		return false;
	}
	return true;
}

/**
 * Build the safe data-* attribute set for the loader tag.
 */
function motoai_agent_loader_attrs( $overrides = array() ) {
	$s      = motoai_agent_settings();
	$merged = array_merge( $s, $overrides );

	return array(
		'data-motoai'        => 'true',
		'data-lang'          => $merged['lang'],
		'data-theme'         => $merged['theme'],
		'data-position'      => ( 'bottom-left' === $merged['position'] ) ? 'left' : 'right',
		'data-title'         => $merged['title'],
		'data-source'        => $merged['source'],
		'data-open'          => ( ! empty( $merged['auto_open'] ) ) ? 'true' : 'false',
		'data-open-delay'    => (string) absint( $merged['auto_open_delay'] ),
	);
}

/**
 * Print the remote loader script tag exactly once per request.
 * Attributes are escaped; the URL is a fixed constant.
 */
function motoai_agent_print_loader( $overrides = array() ) {
	static $printed = false;
	if ( $printed ) {
		return; // never inject a second copy (embed.js is also idempotent).
	}
	$printed = true;

	printf(
		'<script src="%s" async',
		esc_url( MOTOAI_AGENT_EMBED_URL, array( 'https' ) )
	);
	foreach ( motoai_agent_loader_attrs( $overrides ) as $attr => $value ) {
		printf( ' %s="%s"', esc_attr( $attr ), esc_attr( $value ) );
	}
	echo '></script>', "\n";
}

/**
 * Frontend loader: only enqueue when enabled + page passes visibility rules.
 */
function motoai_agent_frontend_loader() {
	if ( ! motoai_agent_is_visible() ) {
		return;
	}
	add_action( 'wp_footer', 'motoai_agent_print_loader', 99 );
}
add_action( 'wp_enqueue_scripts', 'motoai_agent_frontend_loader' );

/**
 * Shortcode: [motoai_agent lang="vi" theme="auto" source="wordpress" open="false"]
 *
 * Forces the widget on this page (bypassing the auto-loader visibility rules
 * is NOT possible — the loader stays unique; shortcode attributes override
 * the global settings for the loader when the widget would otherwise load
 * via the shortcode only).
 */
function motoai_agent_shortcode( $atts ) {
	if ( is_admin() ) {
		return '';
	}
	if ( ! motoai_agent_is_visible() ) {
		return ''; // respects include/exclude + device rules.
	}

	$atts = shortcode_atts(
		array(
			'lang'   => '',
			'theme'  => '',
			'source' => '',
			'open'   => '',
		),
		$atts,
		'motoai_agent'
	);

	$overrides = array();
	if ( '' !== $atts['lang'] ) {
		$overrides['lang'] = ( 'en' === strtolower( $atts['lang'] ) ) ? 'en' : 'vi';
	}
	if ( '' !== $atts['theme'] ) {
		$overrides['theme'] = in_array( strtolower( $atts['theme'] ), array( 'light', 'dark' ), true )
			? strtolower( $atts['theme'] ) : 'auto';
	}
	if ( '' !== $atts['source'] ) {
		$overrides['source'] = substr( preg_replace( '/[^a-z0-9-_]/', '', sanitize_key( $atts['source'] ) ), 0, 64 );
	}
	if ( '' !== $atts['open'] ) {
		$overrides['auto_open'] = ( 'true' === strtolower( $atts['open'] ) || '1' === $atts['open'] ) ? 1 : 0;
	}

	// Defer to wp_footer so the loader tag lands once, in the footer.
	$GLOBALS['motoai_agent_overrides'] = isset( $GLOBALS['motoai_agent_overrides'] )
		? $GLOBALS['motoai_agent_overrides'] : $overrides;
	add_action( 'wp_footer', static function () use ( $overrides ) {
		if ( ! empty( $GLOBALS['motoai_agent_overrides'] ) ) {
			$overrides = array_merge( $overrides, $GLOBALS['motoai_agent_overrides'] );
		}
		motoai_agent_print_loader( $overrides );
	}, 99 );

	return ''; // the widget itself mounts fixed-position via embed.js.
}
add_shortcode('motoai_agent', 'motoai_agent_shortcode');

/**
 * Settings page + links.
 */
function motoai_agent_admin_menu() {
	MotoAI_Settings::register();
	add_options_page(
		'MotoAI Agent',
		'MotoAI Agent',
		'manage_options',
		'motoai-agent',
		array( 'MotoAI_Settings', 'render' )
	);
}
add_action( 'admin_menu', 'motoai_agent_admin_menu' );

function motoai_agent_admin_init() {
	MotoAI_Settings::init();
}
add_action( 'admin_init', 'motoai_agent_admin_init' );

function motoai_agent_settings_link( $links ) {
	$url = admin_url( 'options-general.php?page=motoai-agent' );
	array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'motoai-agent' ) . '</a>' );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'motoai_agent_settings_link' );

function motoai_agent_admin_assets( $hook ) {
	if ( 'settings_page_motoai-agent' !== $hook ) {
		return;
	}
	wp_enqueue_style( 'motoai-agent-admin', plugins_url( 'assets/admin.css', __FILE__ ), array(), MOTOAI_AGENT_VERSION );
	wp_enqueue_script( 'motoai-agent-admin', plugins_url( 'assets/admin.js', __FILE__ ), array(), MOTOAI_AGENT_VERSION, true );
}
add_action( 'admin_enqueue_scripts', 'motoai_agent_admin_assets' );