<?php
/**
 * Plugin Name: MotoAI Agent
 * Plugin URI:  https://thuexemayhanoi.github.io/aichatbot/
 * Description: Lớp loader mỏng cho widget trợ lý thuê xe máy MotoAI. Không bundle engine chat — chỉ in một thẻ &lt;script async&gt; tải embed.js từ URL canonical (GitHub Pages).
 * Version:     1.0.0
 * Author:      Thuê Xe Máy Hà Nội Nguyễn Tú
 * Author URI:  https://thuexemayhanoi.github.io/aichatbot/
 * License:     GPL-2.0-or-later
 * Text Domain: motoai-agent
 */

defined('ABSPATH') || exit;

define('MOTOAI_AGENT_VERSION', '1.0.0');
define('MOTOAI_AGENT_OPTION', 'motoai_agent_settings');
define('MOTOAI_AGENT_EMBED_URL', 'https://thuexemayhanoi.github.io/aichatbot/embed.js');

require_once __DIR__ . '/includes/class-motoai-settings.php';

/**
 * Defaults cho mọi tuỳ chọn (một nơi duy nhất).
 */
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
        'include_pages'    => '',
        'exclude_pages'   => '',
    );
}

/**
 * Settings đã lưu, merge với defaults.
 */
function motoai_agent_settings() {
    $saved = get_option(MOTOAI_AGENT_OPTION, array());
    if (!is_array($saved)) $saved = array();
    return array_merge(motoai_agent_defaults(), $saved);
}

/**
 * Visibility: on/off, mobile/desktop, include/exclude page IDs.
 * Include ưu tiên: nếu đặt, widget chỉ hiện trên các trang đó.
 */
function motoai_agent_is_visible($settings) {
    if (($settings['enabled'] ?? 'off') !== 'on') return false;
    if (wp_is_mobile() && ($settings['show_mobile'] ?? 'on') !== 'on') return false;
    if (!wp_is_mobile() && ($settings['show_desktop'] ?? 'on') !== 'on') return false;

    $page_id = (int) get_queried_object_id();
    $include = array_filter(array_map('absint', preg_split('/[\s,]+/', (string) ($settings['include_pages'] ?? ''))));
    $exclude = array_filter(array_map('absint', preg_split('/[\s,]+/', (string) ($settings['exclude_pages'] ?? ''))));
    if ($include && !in_array($page_id, $include, true)) return false;
    if ($exclude && in_array($page_id, $exclude, true)) return false;
    return true;
}

/**
 * In đúng MỘT thẻ script async cho embed canonical, với data-* từ settings.
 */
function motoai_agent_print_script($overrides = array()) {
    static $printed = false;
    if ($printed) return; // guard: không inject 2 bản (embed.js cũng idempotent)
    $printed = true;

    $settings = array_merge(motoai_agent_settings(), $overrides);
    $lang   = in_array($settings['lang'], array('vi', 'en'), true) ? $settings['lang'] : 'vi';
    $theme  = in_array($settings['theme'], array('auto', 'light', 'dark'), true) ? $settings['theme'] : 'auto';
    $source = sanitize_key($settings['source']);
    if (strlen($source) > 64) $source = substr($source, 0, 64);
    $title    = esc_attr($settings['title']);
    $position = ($settings['position'] === 'bottom-left') ? 'bottom-left' : 'bottom-right';
    $open     = ($settings['open'] === 'on') ? 'true' : 'false';
    $delay    = max(0, min(10000, (int) $settings['open_delay']));

    printf(
        '<script async src="%s" data-lang="%s" data-theme="%s" data-position="%s" data-title="%s" data-source="%s" data-open="%s" data-open-delay="%d"></script>',
        esc_url(MOTOAI_AGENT_EMBED_URL),
        esc_attr($lang),
        esc_attr($theme),
        esc_attr($position),
        $title,
        esc_attr($source ?: 'wordpress'),
        $open,
        $delay
    );
}

/** Auto-loader ở footer (trang public, user có quyền đọc). */
function motoai_agent_footer_loader() {
    $settings = motoai_agent_settings();
    if (motoai_agent_is_visible($settings)) {
        motoai_agent_print_script();
    }
}
add_action('wp_footer', 'motoai_agent_footer_loader');

/**
 * Shortcode [motoai_agent lang theme source open] — mount đúng embed
 * canonical, vẫn tôn trọng visibility rules; nếu auto-loader đã in,
 * cấu hình của loader trước đó thắng (không inject 2 bản).
 */
function motoai_agent_shortcode($atts) {
    $atts = shortcode_atts(array(
        'lang'   => '',
        'theme'  => '',
        'source' => '',
        'open'   => '',
    ), $atts, 'motoai_agent');

    $settings = motoai_agent_settings();
    if (!motoai_agent_is_visible($settings)) return '';

    $overrides = array();
    if ($atts['lang'] !== '')   $overrides['lang'] = ($atts['lang'] === 'en') ? 'en' : 'vi';
    if ($atts['theme'] !== '')  $overrides['theme'] = in_array($atts['theme'], array('auto', 'light', 'dark'), true) ? $atts['theme'] : 'auto';
    if ($atts['source'] !== '') $overrides['source'] = $atts['source'];
    if ($atts['open'] !== '')   $overrides['open'] = (strtolower($atts['open']) === 'true') ? 'on' : 'off';

    // Đánh dấu đã chạy sớm: footer loader thấy rồi sẽ bỏ qua.
    motoai_agent_print_script($overrides);
    return '';
}
add_shortcode('motoai_agent', 'motoai_agent_shortcode');

/** Link Settings trên trang plugin list. */
function motoai_agent_plugin_links($links) {
    $url = admin_url('options-general.php?page=motoai-agent');
    array_unshift($links, '<a href="' . esc_url($url) . '">' . esc_html__('Settings', 'motoai-agent') . '</a>');
    return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'motoai_agent_plugin_links');

/** Khởi tạo trang settings (admin only). */
function motoai_agent_admin_init() {
    MotoAI_Agent_Settings::register();
}
add_action('admin_menu', array('MotoAI_Agent_Settings', 'add_menu'));
add_action('admin_init', 'motoai_agent_admin_init');
