import Gio from 'gi://Gio';

import { DynamicPipeline } from '../../render/dynamic_surface.js';
import { WindowRules, is_app_popup } from './window_rules.js';
import { attach_popup_mask } from './popup_mask.js';
import { compute_scale, place_dynamic_blur } from './window_geometry.js';

const BLUR_ACTOR_NAME = 'bms-app-menu-blurred-widget';

/// Blurs the menus of applications, like GTK popovers, which the applications blur leaves out.
/// The theme decides their shape, so the corner radius only shapes edge effects like refraction.
export const AppMenusBlur = class AppMenusBlur {
    constructor(connections, settings, effects_manager) {
        this.connections = connections;
        this.settings = settings;
        this.effects_manager = effects_manager;
        this.rules = new WindowRules(settings);
        // tracked windows, mapped to their blur once they are a blurred menu
        this.menus = new Map();
        this.enabled = false;
    }

    enable() {
        if (this.enabled)
            return;

        this._log('blurring application menus');
        this.enabled = true;

        this.mutter_gsettings = new Gio.Settings({ schema: 'org.gnome.mutter' });
        this.rules.update();

        global.get_window_actors().forEach(
            window_actor => this.track(window_actor.meta_window)
        );
        this.connections.connect(
            global.display,
            'window-created',
            (_display, meta_window) => this.track(meta_window)
        );
    }

    /// The window type of a popup may only be known after it is created.
    track(meta_window) {
        if (this.menus.has(meta_window))
            return;

        this.menus.set(meta_window, null);
        this.connections.connect(
            meta_window, 'notify::window-type',
            () => this.check_blur(meta_window)
        );
        this.connections.connect(
            meta_window, 'unmanaging',
            () => this.untrack(meta_window)
        );
        this.check_blur(meta_window);
    }

    check_blur(meta_window) {
        const should_blur = is_app_popup(meta_window) && this.rules.matches_popup(meta_window);
        if (should_blur && !this.menus.get(meta_window))
            this.blur(meta_window);
        else if (!should_blur && this.menus.get(meta_window))
            this.remove_blur(meta_window);
    }

    blur(meta_window) {
        const window_actor = meta_window.get_compositor_private();
        if (!window_actor)
            return;

        this._log('blurring a menu');

        const pipeline = new DynamicPipeline(
            this.effects_manager,
            global.blur_my_shell._pipelines_manager,
            this.settings.app_menus.PIPELINE,
            { corner_radius: this.settings.app_menus.CORNER_RADIUS }
        );
        const [blur_actor, bg_manager] = pipeline.create_background_with_effect(
            window_actor, BLUR_ACTOR_NAME
        );
        attach_popup_mask(pipeline, meta_window);

        const menu = { pipeline, blur_actor, bg_manager, signals: [] };
        this.menus.set(meta_window, menu);

        const update_size = () => place_dynamic_blur(
            blur_actor, meta_window, compute_scale(meta_window, this.mutter_gsettings)
        );
        const repaint = () => {
            if (blur_actor.mapped)
                pipeline.repaint_effect();
        };
        menu.signals.push(
            [meta_window, this.connections.connect(meta_window, 'size-changed', update_size)],
            [meta_window, this.connections.connect(meta_window, 'position-changed', repaint)],
            [window_actor, this.connections.connect(
                window_actor, ['notify::x', 'notify::y'], repaint
            )]
        );
        update_size();
    }

    remove_blur(meta_window) {
        const menu = this.menus.get(meta_window);
        if (!menu)
            return;

        menu.signals.forEach(([object, ids]) =>
            [ids].flat().forEach(id => this.connections.disconnect(object, id))
        );
        menu.pipeline.destroy();
        menu.bg_manager.destroy();
        menu.blur_actor.destroy();
        this.menus.set(meta_window, null);
    }

    untrack(meta_window) {
        this.remove_blur(meta_window);
        this.connections.disconnect_all_for(meta_window);
        this.menus.delete(meta_window);
    }

    update_pipeline() {
        this.menus.forEach(menu =>
            menu?.pipeline.change_pipeline_to(this.settings.app_menus.PIPELINE)
        );
    }

    update_corner_radius() {
        this.menus.forEach(menu =>
            menu?.pipeline.set_corner_radius(this.settings.app_menus.CORNER_RADIUS)
        );
    }

    /// Follows the window rules of the applications blur.
    update_rules() {
        this.rules.update();
        this.menus.forEach((_, meta_window) => this.check_blur(meta_window));
    }

    disable() {
        this._log('removing blur from application menus');
        this.enabled = false;

        [...this.menus.keys()].forEach(meta_window => this.untrack(meta_window));
        this.connections.disconnect_all();
        delete this.mutter_gsettings;
    }

    _log(str) {
        if (this.settings.DEBUG)
            console.log(`[Blur my Shell > app menus]    ${str}`);
    }
};
