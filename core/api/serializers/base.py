from rest_framework import serializers

    # GENERIC_PARAMS = {"cache", "limit", "offset"}
    # def validate(self, attrs):
    #     for param in self.GENERIC_PARAMS:
    #         self.context[param] = attrs.pop(param, None)
    #     return attrs
class BaseSerializer(serializers.Serializer):

    @classmethod
    def serialize(cls, obj):
        return cls(obj).data
    
    def get_validated_data(self):
        self.is_valid(raise_exception=True)
        return self.validated_data
