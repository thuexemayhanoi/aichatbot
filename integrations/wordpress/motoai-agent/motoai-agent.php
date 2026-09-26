<?php
/**
 * Plugin Name: MotoAI Agent
 * Plugin URI:  https://thuexemayhanoi.github.io/aichatbot/
 * Description: Lớp loader mỏng cho widget trợ lý thuê xe máy MotoAI. Không bundle engine chat — chỉ in một thẻ script async tải embed.js từ URL canonical (GitHub Pages).
 * Version:     1.0.0
 * Author:      Thuê Xe Máy Hà Nội Nguyễn Tú
 * Author URI:  https://thuexemayhanoi.github.io/aichatbot/
 * License:     GPL-2.0-or-later
 * Text Domain: motoai-agent
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

defined('ABSPATH') || exit;

define('MOTOAI_AGENT_VERSION', '1.0.0');
define('MOTOAI_AGENT_OPTION', 'motoai_agent_settings');
define('MOTOAI_AGENT_EMBED_URL', 'https://thuexemayhanoi.github.io/aichatbot/embed.js');

require_once __DIR__ . '/includes/class-motoai-settings.php';

/** Defaults cho mọi tuỳ chọn (một nơi duy nhất). */
function motoai_agent_defaults() {
    return array(
        'enabled'         => 'off',
        'lang'            => 'vi',
        'theme'           => 'auto',
        'position'        => 'bottom-right',
        'title'           => 'Hỗ trợ Agent',
        'source'          => 'wordpress',
        'open'            => 'off',
        'open_delay'      => 0,
        'show_mobile'     => 'on',
        'show_desktop'    => 'on',
        'include_pages'   => '',
        'exclude_pages'   => '',
    );
}

/** Settings đã lưu, merge với defaults. */
function motoai_agent_get_settings() {
    $saved = get_option(MOTOAI_AGENT_OPTION, array());
    if (!is_array($saved)) $saved = array();
    return array_merge(motoai_agent_defaults(), $saved);
}

/**
 * Sanitize whitelist cho toàn bộ option (Settings API callback).
 * Mọi input đi qua đây; không có đường lưu nào khác.
 */
function motoai_agent_sanitize_settings($input) {
    if (!is_array($input)) return motoai_agent_defaults();
    $d = motoai_agent_defaults();

    $out = array();
    $out['enabled']      = (!empty($input['enabled']) && $input['enabled'] === 'on') ? 'on' : 'off';
    $out['lang']         = (isset($input['lang']) && $input['lang'] === 'en') ? 'en' : $d['lang'];
    $out['theme']        = (isset($input['theme']) && in_array($input['theme'], array('auto', 'light', 'dark'), true)) ? $input['theme'] : $d['theme'];
    $out['position']     = (isset($input['position']) && $input['position'] === 'bottom-left') ? 'bottom-left' : 'bottom-right';
    $out['title']        = substr(sanitize_text_field(isset($input['title']) ? $input['title'] : $d['title']), 0, 40);
    $out['source']       = substr(sanitize_key(isset($input['source']) ? $input['source'] : $d['source']), 0, 64);
    $out['open']         = (!empty($input['open']) && $input['open'] === 'on') ? 'on' : 'off';
    $out['open_delay']   = max(0, min(10000, absint(isset($input['open_delay']) ? $input['open_delay'] : 0)));
    $out['show_mobile']  = (!empty($input['show_mobile']) && $input['show_mobile'] === 'on') ? 'on' : 'off';
    $out['show_desktop'] = (!empty($input['show_desktop']) && $input['show_desktop'] === 'on') ? 'on' : 'off';
    $out['include_pages'] = motoai_agent_sanitize_page_list(isset($input['include_pages']) ? $input['include_pages'] : '');
    $out['exclude_pages'] = motoai_agent_sanitize_page_list(isset($input['exclude_pages']) ? $input['exclude_pages'] : '');

    return $out;
}

/** Page-list sanitizer: chỉ giữ id số (absint), không slug, không DB query. */
function motoai_agent_sanitize_page_list( $raw ) {
    $raw = sanitize_text_field((string) $raw);
    $ids = array_filter(array_map('absint', preg_split('/[\s,]+/', $raw)));
    return implode(', ', $ids);
}

/**
 * Visibility: on/off, mobile/desktop, include/exclude page IDs.
 * Include ưu tiên: nếu đặt, widget chỉ hiện trên các trang đó.
 */
function motoai_agent_is_visible() {
    $settings = motoai_agent_get_settings();
    if (($settings['enabled'] ?? 'off') !== 'on') return false;
    if (wp_is_mobile() && ($settings['show_mobile'] ?? 'on') !== 'on') return false;
    if (!wp_is_mobile() && ($settings['show_desktop'] ?? 'on') !== 'on') return false;

    $page_id = (int) get_queried_object_id();
    $include = array_filter(array_map('absint', preg_split('/[\s,]+/', (string) ($settings['include_pages'] ?? ''))));
    $exclude = array_filter(array_map('absint', preg_split('/[\s,]+/', (string) ($settings['exclude_pages'] ?? ''))));
    if ($include && !in_array( $page_id, $include, true )) return false;
    if ($exclude && in_array( $page_id, $exclude, true )) return false;
    return true;
}

/** Data-attribute set đầy đủ, whitelist theo key + sanitize theo kiểu. */
function motoai_agent_data_attributes( $overrides = array() ) {
    $settings = array_merge(motoai_agent_get_settings(), $overrides);
    $lang   = (isset($settings['lang']) && $settings['lang'] === 'en') ? 'en' : 'vi';
    $theme  = (isset($settings['theme']) && in_array($settings['theme'], array('auto', 'light', 'dark'), true)) ? $settings['theme'] : 'auto';
    $source = substr(sanitize_key(isset($settings['source']) ? $settings['source'] : 'wordpress'), 0, 64);
    $title  = substr(sanitize_text_field(isset($settings['title']) ? $settings['title'] : ''), 0, 40);
    $position = (isset($settings['position']) && $settings['position'] === 'bottom-left') ? 'bottom-left' : 'bottom-right';
    $open   = (!empty($settings['open']) && $settings['open'] === 'on') ? 'true' : 'false';
    $delay  = max(0, min(10000, absint(isset($settings['open_delay']) ? $settings['open_delay'] : 0)));

    return array(
        'data-motoai'     => '1',
        'data-lang'       => $lang,
        'data-theme'      => $theme,
        'data-position'   => $position,
        'data-title'      => $title,
        'data-source'     => $source,
        'data-open'       => $open,
        'data-open-delay' => $delay,
    );
}

/**
 * In đúng MỘT thẻ script async cho embed canonical.
 * Guard static: không inject 2 bản (embed.js cũng idempotent).
 */
function motoai_agent_print_loader( $overrides = array() ) {
    static $printed = false;
    if ( $printed ) { return; }
    $printed = true;

    $attrs = '';
    foreach ( motoai_agent_data_attributes( $overrides ) as $attr => $value ) {
        $attrs .= sprintf( ' %s="%s"', esc_attr( $attr ), esc_attr( $value ) );
    }
    printf( '<script src="%s" async %s></script>', esc_url( MOTOAI_AGENT_EMBED_URL, array( 'https' ) ), $attrs );
}

/** Frontend loader: widget chỉ in ở footer khi visibility cho phép. */
function motoai_agent_frontend_loader() {
    if ( motoai_agent_is_visible() ) {
        add_action( 'wp_footer', 'motoai_agent_print_loader', 99 );
    }
}
add_action( 'wp_enqueue_scripts', 'motoai_agent_frontend_loader' );

/**
 * Shortcode [motoai_agent lang theme source open] — mount đúng embed
 * canonical, vẫn tôn trọng visibility rules; nếu loader đã in,
 * cấu hình của loader trước đó thắng (không inject 2 bản).
 */
function motoai_agent_shortcode( $atts ) {
    $atts = shortcode_atts(array(
        'lang'   => '',
        'theme'  => '',
        'source' => '',
        'open'   => '',
    ), $atts, 'motoai_agent');

    if ( ! motoai_agent_is_visible() ) return '';

    $overrides = array();
    if ($atts['lang'] !== '')   $overrides['lang'] = ($atts['lang'] === 'en') ? 'en' : 'vi';
    if ($atts['theme'] !== '')  $overrides['theme'] = in_array($atts['theme'], array('auto', 'light', 'dark'), true) ? $atts['theme'] : 'auto';
    if ($atts['source'] !== '') $overrides['source'] = $atts['source'];
    if ($atts['open'] !== '')   $overrides['open'] = (strtolower($atts['open']) === 'true') ? 'on' : 'off';

    motoai_agent_print_loader( $overrides );
    return '';
}
add_shortcode( 'motoai_agent', 'motoai_agent_shortcode' );

/** Link Settings trên trang plugin list. */
function motoai_agent_plugin_links( $links ) {
    $url = admin_url('options-general.php?page=motoai-agent');
    array_unshift($links, '<a href="' . esc_url( $url ) . '">' . esc_html__('Settings', 'motoai-agent') . '</a>');
    return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'motoai_agent_plugin_links');

/** Khởi tạo trang settings (admin only). */
add_action('admin_menu', array('MotoAI_Agent_Settings', 'add_menu'));
add_action('admin_init', array('MotoAI_Agent_Settings', 'register'));
