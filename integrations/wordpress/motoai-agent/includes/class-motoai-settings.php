<?php
/**
 * Settings API cho MotoAI Agent (admin only).
 * Mọi input được sanitize khi lưu (motoai_agent_sanitize_settings),
 * mọi output được escape. Nonce do settings_fields() phát hành,
 * capability manage_options bắt buộc.
 */

defined('ABSPATH') || exit;

class MotoAI_Agent_Settings {

    const GROUP = 'motoai_agent_group';
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
            self::GROUP,
            MOTOAI_AGENT_OPTION,
            array(
                'type'              => 'array',
                'sanitize_callback' => 'motoai_agent_sanitize_settings',
                'show_in_rest'      => false,
            )
        );
    }

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'Bạn không đủ quyền truy cập trang này.', 'motoai-agent' ) );
        }
        $s = motoai_agent_get_settings();
        $opt = MOTOAI_AGENT_OPTION;
        ?>
        <div class="wrap">
            <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
            <p><?php esc_html_e( 'Widget trợ lý thuê xe máy MotoAI — loader mỏng, engine chat chạy trên GitHub Pages canonical.', 'motoai-agent' ); ?></p>
            <form method="post" action="options.php">
                <?php settings_fields( self::GROUP ); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="motoai-enabled"><?php esc_html_e( 'Bật Agent', 'motoai-agent' ); ?></label></th>
                        <td>
                            <input type="checkbox" id="motoai-enabled" name="<?php echo esc_attr( $opt ); ?>[enabled]" value="on" <?php checked( $s['enabled'], 'on' ); ?>>
                            <span class="motoai-hint"><?php esc_html_e( 'Master switch — widget chỉ hiện khi bật.', 'motoai-agent' ); ?></span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-lang"><?php esc_html_e( 'Ngôn ngữ', 'motoai-agent' ); ?></label></th>
                        <td>
                            <select id="motoai-lang" name="<?php echo esc_attr( $opt ); ?>[lang]">
                                <option value="vi" <?php selected( $s['lang'], 'vi' ); ?>><?php esc_html_e( 'Tiếng Việt', 'motoai-agent' ); ?></option>
                                <option value="en" <?php selected( $s['lang'], 'en' ); ?>>English</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-theme"><?php esc_html_e( 'Giao diện', 'motoai-agent' ); ?></label></th>
                        <td>
                            <select id="motoai-theme" name="<?php echo esc_attr( $opt ); ?>[theme]">
                                <?php foreach ( array( 'auto', 'light', 'dark' ) as $t ) : ?>
                                    <option value="<?php echo esc_attr( $t ); ?>" <?php selected( $s['theme'], $t ); ?>><?php echo esc_html( $t ); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-position"><?php esc_html_e( 'Vị trí', 'motoai-agent' ); ?></label></th>
                        <td>
                            <select id="motoai-position" name="<?php echo esc_attr( $opt ); ?>[position]">
                                <option value="bottom-right" <?php selected( $s['position'], 'bottom-right' ); ?>>bottom-right</option>
                                <option value="bottom-left" <?php selected( $s['position'], 'bottom-left' ); ?>>bottom-left</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-title"><?php esc_html_e( 'Tiêu đề widget', 'motoai-agent' ); ?></label></th>
                        <td><input type="text" id="motoai-title" class="regular-text" name="<?php echo esc_attr( $opt ); ?>[title]" value="<?php echo esc_attr( $s['title'] ); ?>" maxlength="40"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-source"><?php esc_html_e( 'Nhãn nguồn (source)', 'motoai-agent' ); ?></label></th>
                        <td>
                            <input type="text" id="motoai-source" class="regular-text" name="<?php echo esc_attr( $opt ); ?>[source]" value="<?php echo esc_attr( $s['source'] ); ?>" maxlength="64">
                            <p class="description"><?php esc_html_e( 'Slug kỹ thuật (a-z, 0-9, gạch ngang). KHÔNG chứa thông tin cá nhân.', 'motoai-agent' ); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e( 'Tự động mở', 'motoai-agent' ); ?></th>
                        <td>
                            <label><input type="checkbox" name="<?php echo esc_attr( $opt ); ?>[open]" value="on" <?php checked( $s['open'], 'on' ); ?>> <?php esc_html_e( 'Mở widget tự động', 'motoai-agent' ); ?></label>
                            <label class="motoai-delay"><input type="number" id="motoai-open-delay" name="<?php echo esc_attr( $opt ); ?>[open_delay]" value="<?php echo esc_attr( (int) $s['open_delay'] ); ?>" min="0" max="10000" step="100"> ms</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e( 'Hiện trên', 'motoai-agent' ); ?></th>
                        <td>
                            <label><input type="checkbox" name="<?php echo esc_attr( $opt ); ?>[show_mobile]" value="on" <?php checked( $s['show_mobile'], 'on' ); ?>> Mobile</label>
                            <label><input type="checkbox" name="<?php echo esc_attr( $opt ); ?>[show_desktop]" value="on" <?php checked( $s['show_desktop'], 'on' ); ?>> Desktop</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-include"><?php esc_html_e( 'Include pages (IDs)', 'motoai-agent' ); ?></label></th>
                        <td><input type="text" id="motoai-include" class="regular-text" name="<?php echo esc_attr( $opt ); ?>[include_pages]" value="<?php echo esc_attr( $s['include_pages'] ); ?>" placeholder="3, 12"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="motoai-exclude"><?php esc_html_e( 'Exclude pages (IDs)', 'motoai-agent' ); ?></label></th>
                        <td><input type="text" id="motoai-exclude" class="regular-text" name="<?php echo esc_attr( $opt ); ?>[exclude_pages]" value="<?php echo esc_attr( $s['exclude_pages'] ); ?>" placeholder="7, 20"></td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}
