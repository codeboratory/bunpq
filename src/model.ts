export abstract class Model<$Params> {
	name: string;
	params: $Params;

	constructor(name: string, params: $Params) {
		this.name = name;
		this.params = params;
	}
}
