"""Query and aggregation logic behind the ``/api/calculations`` router.

``api/calculations.py`` keeps the routes (signatures, parameters, OpenAPI
docstrings); each route delegates its body to a function here so the router
stays a thin, readable index of the endpoints.
"""
