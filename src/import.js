import { defineHook } from "@directus/extensions-sdk";
import fs from 'node:fs'

export default defineHook(({ init, action }, { services, getSchema, database }) => {

    action('server.start', async () => {

        // Test if folder can be read
        await fs.access('/directus/templates/', fs.constants.W_OK, async (err) => {
            if (err) {
                log('Template directory could not be read. Skipping import')
            } else {
                const schema = await getSchema()

                await importBase(schema)
                await importCollections(schema)
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

        const templates = ['settings', 'roles', 'dashboards', 'flows', 'operations', 'panels', 'permissions', 'translations']

        await templates.reduce(async (prev, template) => {
            // Wait for the previous template to finish processing
            await prev;

            // Process this one
            try {
                const file_content = fs.readFileSync('/directus/templates/' + template + '.json', 'utf8')
                if(file_content) {
                    const obj = JSON.parse(file_content)
                    const service = new ItemsService('directus_' + template, { schema, knex: database })
                    await service.upsertSingleton(obj)

                    log(template + ' imported!')
                } else {
                    log(template + ' seems empty')
                }
            } catch (err) {
                log('Could not import ' + template);
            }
        }, Promise.resolve());
    }

    async function importCollections(schema) {
        const { CollectionsService, FieldsService, RelationsService } = services;

        const file_content = fs.readFileSync('/directus/templates/collections.json', 'utf8')
        const data = JSON.parse(file_content)

        const collectionsService = new CollectionsService({schema, knex: database})
        const fieldsService = new FieldsService({schema, knex: database})
        const relationsService = new RelationsService({schema, knex: database})

        const collections = data.collections || [];
        const fields = data.fields || [];
        const relations = data.relations || [];

        const allCollections = await collectionsService.readByQuery()

        try {
            const importedCollections = [];
            let lastLength = null;
            while (importedCollections.length !== lastLength) {
                lastLength = importedCollections.length;

                // COLLECTIONS //
                for (const collection of collections) {
                    if (importedCollections.includes(collection.collection)) {
                        continue;
                    }
                    if (collection.meta?.group) {
                        const { group } = collection.meta;
                        if (!collections.some(c => c.collection === group) && !allCollections.some(c => c.collection === group)) {
                            importedCollections.push(collection.collection);
                            log('Skipping collection ' + collection.collection + ' because its group ' + group + ' does not exist')
                            continue;
                        }
                        if (!importedCollections.includes(group) && !allCollections.some(c => c.collection === group)) {
                            continue;
                        }
                    }

                    await collectionsService.updateOne(collection.collection, collection).then(() => {
                        log('Updated collection ' + collection.collection)
                    }).finally(() => {
                        importedCollections.push(collection.collection);
                    })
                }
            }

            // FIELDS //
            for (const field of fields) {
                if (allCollections.some(c => c.collection === field.collection)) {
                    if (!fieldsService.readOne(field.collection, field.field)) {
                        await fieldsService.createField(field.collection, field).then(() => {
                            log('Field ' + field.collection + '-' + field.field + ' created')
                        })
                    } else {
                        await fieldsService.updateField(field.collection, field).then(() => {
                            log('Field ' + field.collection + '-' + field.field + ' updated')
                        })
                    }
                }
            }

            // RELATIONS //
            for (const relation of relations) {
                if (!relationsService.readOne(relation.collection, relation.field)) {
                    await relationsService.createOne(relation).then(() => {
                        log('Created relation ' + relation.collection + '-' + relation.field + '-' + relation.related_collection + '')
                    })
                } else {
                    await relationsService.updateOne(relation.collection, relation.field, relation).then(() => {
                        log('Updated relation ' + relation.collection + '-' + relation.field + '-' + relation.related_collection + '')
                    })
                }
            }

        } catch (err) {
            const message = err.response?.data?.errors?.[0]?.message || err.message || undefined;
            log('Error: ' + message)
        } finally {
            log('Collections synced')
        }

    }
});
