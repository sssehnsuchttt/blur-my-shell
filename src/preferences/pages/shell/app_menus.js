import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import { ui_template } from '../../resources.js';
import { bind_settings } from '../../bind_settings.js';


export const AppMenus = GObject.registerClass({
    GTypeName: 'AppMenus',
    Template: ui_template('pages/shell/app-menus.ui'),
    InternalChildren: [
        'blur',
        'pipeline_choose_row',
        'corner_radius'
    ],
}, class AppMenus extends Adw.PreferencesPage {
    constructor(preferences, pipelines_manager, pipelines_page) {
        super({});

        this._pipeline_choose_row.initialize(preferences.app_menus, pipelines_manager, pipelines_page);

        bind_settings(preferences.app_menus, [
            ['blur', this._blur, 'active'],
            ['corner-radius', this._corner_radius, 'value'],
        ]);
    }
});
