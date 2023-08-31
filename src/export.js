import ModuleComponent from './module.vue';
import { defineModule } from '@directus/extensions-sdk';
export default defineModule({
	id: 'm2m_export',
	name: 'M2M Export',
	icon: 'data_object',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
	],
});
