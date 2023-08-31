<template>
	<private-view title="Machine-to-machine export">

		<div class="form-grid with-fill">
			<div class="full" v-if="collections">
				<v-button full-width @click="getSnapshot()" align="left">
					<v-icon name="download"/>
					<span class="ucfirst">Custom collections ({{ collections.map(c => c.collection).join(',')}})</span>
				</v-button>
			</div>

			<div v-for="(schema, index) in schemas" v-bind:key="schema" :class="index % 2 ? 'half-right' : 'half'">
				<v-button full-width @click="downloadSchema(schema)" align="left">
					<v-icon name="download"/>
					<span class="ucfirst">{{ schema }}</span>
				</v-button>
			</div>
		</div>

	</private-view>
</template>

<script>

import { useApi } from '@directus/extensions-sdk';
import { useStores } from '@directus/composables';
import { computed } from 'vue';
import { sortBy } from 'lodash';

export default {

	setup() {
		const {
			useCollectionsStore,
			useFieldsStore,
			useRelationsStore,
		} = useStores();

		const collectionsStore = useCollectionsStore();
		const fieldsStore = useFieldsStore();
		const relationsStore = useRelationsStore();

		const collections = computed(() => sortBy(collectionsStore.collections.filter(c => c.meta && !c.collection.startsWith('directus_')), ['meta.sort', 'collection']))

		const schemas = [
			'settings', 'roles', 'dashboards', 'flows', 'operations', 'panels', 'permissions', 'translations'
		]

		const api = useApi();

		function downloadFile(data, filename) {
			const element = document.createElement('a');
			element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(data));
			element.setAttribute('download', filename + '.json');
			element.style.display = 'none';
			document.body.appendChild(element);
			element.click();
			document.body.removeChild(element);
		}

		async function downloadSchema(schema) {
			await api.get('/' + schema).then(result => {
				if(result.data) {
					const data = JSON.stringify(result.data.data, null, 4);

					downloadFile(data, schema)
				}
			})
		}

		function getSnapshot() {
			const exportCollections = collections.value
					.map(({ collection, meta, schema }) => ({ collection, meta, schema: schema !== null ? {} : null }));

			const fields = collections.value
					.map(c => fieldsStore.getFieldsForCollection(c.collection))
					.flat()
					.map(({ name, ...field }) => {
						const f = field;
						if (field.meta) {
							const { id, ...meta } = field.meta;
							f.meta = meta;
						}
						return f;
					});

			const relations = collections.value
					.map(c => (relationsStore.relations).filter(r => r.collection === c.collection))
					.flat()
					.map((rel) => {
						const r = rel;
						if (rel.meta) {
							const { id, ...meta } = rel.meta;
							r.meta = meta;
						}
						return r;
					});

			const schema = {
				collections: exportCollections,
				fields,
				relations,
			};

			const data = JSON.stringify(schema, null, 4);

			downloadFile(data, 'collections')
		}

		return {
			schemas,
			collections,
			downloadSchema,
			getSnapshot
		}
	}

};

</script>

<style scoped>

.ucfirst {
	text-transform: capitalize;
}

.form-grid {
	margin: 24px;
}

</style>
