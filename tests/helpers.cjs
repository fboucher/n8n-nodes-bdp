// Shared mocked-execution helpers for resource tests.
function createContext(parameters, responses, inputItems = [{ json: {} }], continueOnFail = false) {
	const calls = [];
	let callCount = 0;
	return {
		calls,
		context: {
			getNode: () => ({ name: 'Test BDP Node', type: 'n8n-nodes-bdp.bdp' }),
			getInputData: () => inputItems,
			getNodeParameter(name, itemIndex, defaultValue, options) {
				const isLoadOptionsCall = typeof itemIndex !== 'number';
				const itemParameters = isLoadOptionsCall
					? (parameters[0] ?? {})
					: (parameters[itemIndex] ?? parameters[0] ?? {});
				if (isLoadOptionsCall) {
					options = defaultValue;
					defaultValue = itemIndex;
				}
				let value = itemParameters[name] ?? defaultValue;
				if (options?.extractValue && value && typeof value === 'object') {
					value = value.value;
				}
				return value;
			},
			getCredentials: async () => ({ environment: 'uat' }),
			continueOnFail: () => continueOnFail,
			helpers: {
				httpRequestWithAuthentication: async function (_credentialType, options) {
					calls.push(options);
					const response = responses[callCount++];
					if (response instanceof Error) throw response;
					if (typeof response === 'function') return response(options);
					return response ?? { body: [], headers: {} };
				},
			},
		},
	};
}

function errorWithStatus(statusCode, headers = {}) {
	const error = new Error('private response body must not leak');
	error.response = { statusCode, headers, body: 'private response body must not leak' };
	return error;
}

const paths = (calls) => calls.map(({ url }) => new URL(url).pathname);

module.exports = { createContext, errorWithStatus, paths };
