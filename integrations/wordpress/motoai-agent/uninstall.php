<?php
/**
 * Uninstall — xoá duy nhất option của plugin, không để lại dữ liệu khác.
 */

defined('WP_UNINSTALL_PLUGIN') || exit;

delete_option( 'motoai_agent_settings' );
