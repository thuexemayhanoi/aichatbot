<?php
/**
 * Settings API cho MotoAI Agent (admin only).
 * Mọi input được sanitize khi lưu, mọi output được escape.
 */

defined('ABSPATH') || exit;

class MotoAI_Agent_Settings {

    const PAGE_SLUG = 'motoai-agent';

    public static function add_menu() {
        add_options_page(
            'MotoAI Agent',
            'MotoAI Agent',
            'manage_options',
            self::PAGE_SLUG,
            array(__CLASS__, 'render_page')
        );
    }

    public static function register() {
        register_setting(
            'motoai_agent_group',
            MOTOAI_AGENT_OPTION,
            array('sanitize_callback' => array(__CLASS__, 'sanitize'))
        );
    }

    /** Sanitize whitelist — mọi input đi qua đây. */
    public static function sanitize($input) {
        if (!is_array($input)) return motoai_agent_defaults();
        $d = motoai_agent_defaults();
        $out = array();

        $out['enabled']      = (!empty($input['enabled']) && $input['enabled'] === 'on') ? 'on' : 'off';
        $out['lang']         = (isset($input['lang']) && $input['lang'] === 'en') ? 'en' : 'vi';
        $out['theme']        = (isset($input['theme']) && in_array($input['theme'], array('auto', 'light', 'dark'), true)) ? $input['theme'] : $d['theme'];
        $out['position']     = (isset($input['position']) && $input['position'] === 'bottom-left') ? 'bottom-left' : 'bottom-right';
        $out['title']        = substr(sanitize_text_field($input['title'] ?? $d['title']), 0, 40);
        $out['source']       = substr(sanitize_key($input['source'] ?? $d['source']), 0, 64);
        $out['open']         = (!empty($input['open']) && $input['open'] === 'on') ? 'on' : 'off';
        $out['open_delay']   = max(0, min(10000, absint($input['open_delay'] ?? 0)));
        $out['show_mobile']  = (!empty($input['show_mobile']) && $input['show_mobile'] === 'on') ? 'on' : 'off';
        $out['show_desktop'] = (!empty($input['show_desktop']) && $input['show_desktop'] === 'on') ? 'on' : 'off';
        $out['include_pages']  = self::sanitize_ids($input['include_pages'] ?? '');
        $out['exclude_pages']  = self::sanitize_ids($input['exclude_pages'] ?? '');

        return $out;
    }

    private static function sanitize_ids($raw) {
        $ids = array_filter(array_map('absint', preg_split('/[\s,]+/', (string) $raw)));
        return implode(', ', $ids);
    }

    public static function render_page() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Bạn không đủ quyền truy cập trang này.', 'motoai-agent'));
        }
        $s = motoai_agent_settings();
        ?>
        <div class="wrap">
            <h1>MotoAI Agent</h1>
            <p><?php esc_html_e('Widget trợ lý thuê xe máy MotoAI — loader mỏng, engine chat chạy trên GitHub Pages canonical.', 'motoai-agent'); ?></p>
            <form method="post" action="options.php">
                <?php settings_fields('motoai_agent_group'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="motoai-enabled"><?php esc_html_e('Bật Agent', 'motoai-agent'); ?></label></th>
                        <td>
                            <input type="checkbox" id="motoai-enabled" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[enabled]" value="on" <?php checked($s['enabled'], 'on'); ?>>
                            <span class="motoai-hint"><?php esc_html_e('Master switch — widget chỉ hiện khi bật.', 'motoai-agent'); ?></span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-lang"><?php esc_html_e('Ngôn ngữ', 'motoai-agent'); ?></label></th>
                        <td>
                            <select id="motoai-lang" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[lang]">
                                <option value="vi" <?php selected($s['lang'], 'vi'); ?>>Tiếng Việt</option>
                                <option value="en" <?php selected($s['lang'], 'en'); ?>>English</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-theme"><?php esc_html_e('Giao diện', 'motoai-agent'); ?></label></th>
                        <td>
                            <select id="motoai-theme" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[theme]">
                                <?php foreach (array('auto', 'light', 'dark') as $t) : ?>
                                    <option value="<?php echo esc_attr($t); ?>" <?php selected($s['theme'], $t); ?>><?php echo esc_html($t); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-position"><?php esc_html_e('Vị trí', 'motoai-agent'); ?></label></th>
                        <td>
                            <select id="motoai-position" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[position]">
                                <option value="bottom-right" <?php selected($s['position'], 'bottom-right'); ?>>bottom-right</option>
                                <option value="bottom-left" <?php selected($s['position'], 'bottom-left'); ?>>bottom-left</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-title"><?php esc_html_e('Tiêu đề widget', 'motoai-agent'); ?></label></th>
                        <td><input type="text" id="motoai-title" class="regular-text" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[title]" value="<?php echo esc_attr($s['title']); ?>" maxlength="40"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-source"><?php esc_html_e('Nhãn nguồn (source)', 'motoai-agent'); ?></label></th>
                        <td>
                            <input type="text" id="motoai-source" class="regular-text" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[source]" value="<?php echo esc_attr($s['source']); ?>" maxlength="64">
                            <p class="description"><?php esc_html_e('Slug kỹ thuật (a-z, 0-9, gạch ngang). KHÔNG chứa thông tin cá nhân.', 'motoai-agent'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Tự động mở', 'motoai-agent'); ?></th>
                        <td>
                            <label><input type="checkbox" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[open]" value="on" <?php checked($s['open'], 'on'); ?>> <?php esc_html_e('Mở widget tự động', 'motoai-agent'); ?></label>
                            <label class="motoai-delay"><input type="number" id="motoai-open-delay" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[open_delay]" value="<?php echo esc_attr((int) $s['open_delay']); ?>" min="0" max="10000" step="100"> ms</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Hiện trên', 'motoai-agent'); ?></th>
                        <td>
                            <label><input type="checkbox" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[show_mobile]" value="on" <?php checked($s['show_mobile'], 'on'); ?>> Mobile</label>
                            <label><input type="checkbox" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[show_desktop]" value="on" <?php checked($s['show_desktop'], 'on'); ?>> Desktop</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-include"><?php esc_html_e('Include pages (IDs)', 'motoai-agent'); ?></label></th>
                        <td><input type="text" id="motoai-include" class="regular-text" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[include_pages]" value="<?php echo esc_attr($s['include_pages']); ?>" placeholder="3, 12"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-exclude"><?php esc_html_e('Exclude pages (IDs)', 'motoai-agent'); ?></label></th>
                        <td><input type="text" id="motoai-exclude" class="regular-text" name="<?php echo esc_attr(MOTOAI_AGENT_OPTION); ?>[exclude_pages]" value="<?php echo esc_attr($s['exclude_pages']); ?>" placeholder="7, 20"></td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}
