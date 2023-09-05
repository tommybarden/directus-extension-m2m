import { defineHook } from "@directus/extensions-sdk";
import fs from 'node:fs'
import { execSync } from "node:child_process";

export default defineHook(({ init, action }, { services, getSchema, database }) => {

    action('server.start', () => {
        fs.access('/directus/templates/', fs.constants.W_OK, async (err) => {
            if (!err) {
                const schema = await getSchema({database, bypassCache: true})

                await importCollections()
                await importBase(schema)
                log('Imports done.')
            }
        })
    });

    function log(msg) {
        const now = new Date()
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
        const timestamp = `${hours}:${minutes}:${seconds}.${milliseconds}`
        console.log('[' + timestamp + '] M2M: ' + msg)
    }

    async function importBase(schema) {
        const { ItemsService } = services;

        const templates = ['settings', 'roles', 'permissions', 'flows', 'operations', 'dashboards', 'panels', 'translations']
        const admin = await database.select('id').from('directus_roles').where('admin_access', true).first()
        let old_admin = admin

        await templates.reduce(async (prev, template) => {
            // Wait for the previous template to finish processing
            await prev;

            // Process this one
            try {
                const path = '/directus/templates/' + template + '.json'
                const file_content = fs.readFileSync(path, 'utf8')
                if(file_content) {

                    let obj = JSON.parse(file_content)
                    if(Object.keys(obj).length) {

                        if('roles' === template) {
                            old_admin = obj.find(role => role.admin_access)
                            obj = obj.filter(role => !role.admin_access)
                        }

                        // Remove all permissions regarding admin
                        if(old_admin && 'permissions' === template) {
                            obj = obj.filter(role => role.role !== old_admin.id)
                        }

                        // Set current admin as creator of content
                        if(admin && ('operations' === template || 'dashboards' === template || 'flows' === template || 'panels' === template)) {
                            obj.forEach(row => delete row.user_created)
                        }

                        // Panels are not created yet, remove from array
                        if('dashboards' === template) {
                            obj.forEach(row => delete row.panels)
                        }

                        const service = new ItemsService('directus_' + template, {schema, knex: database})

                        if('object' === typeof Object.values(obj)[0]) {
                            await service.upsertMany(obj).then(()=>{
                                log(template + ' imported (many)!')
                            })
                        } else {
                            await service.upsertSingleton(obj).then(()=>{
                                log(template + ' imported (singleton)!')
                            })
                        }

                    } else {
                        log(template + ' array empty. Skipping.')
                    }
                } else {
                    log(template + ' seems empty. Skipping')
                }
            } catch (err) {
                log('Could not import ' + template + ': ' + err);
            }
        }, Promise.resolve());
    }

    async function importCollections() {
        try {
            const result = execSync('npx directus schema apply --yes ./templates/snapshot.json').toString()
            log(result)
        } catch (error) {
            log(error.message)
        }
    }
});
