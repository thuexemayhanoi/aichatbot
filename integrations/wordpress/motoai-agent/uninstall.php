<?php
/**
 * Uninstall cleanup for MotoAI Agent.
 * Runs only when the plugin is deleted from WordPress admin.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// The plugin stores nothing else: no transients, no user meta, no tables.
delete_option( 'motoai_agent_settings' );
